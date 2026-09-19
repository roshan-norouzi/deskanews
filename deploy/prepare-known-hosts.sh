#!/usr/bin/env bash
set -euo pipefail

# Convert a verified server public key to the exact known_hosts aliases that
# OpenSSH uses for the configured host and port. This lets an administrator
# safely store a key collected through a provider console even when it was
# collected with an IP address while SERVER_HOST uses a DNS name (or vice
# versa). SHA256 and MD5 fingerprints are also safe: a scanned key is used
# only after its fingerprint exactly matches the pinned Secret.
#
# SERVER_SSH_KNOWN_HOSTS was introduced after deployments had already been
# working with automatic host-key discovery. Keep that value optional so a
# missing or legacy malformed value cannot block an otherwise valid deploy.
# In that compatibility path we reproduce the earlier ssh-keyscan behaviour,
# then continue with StrictHostKeyChecking=yes. A valid explicit fingerprint
# is never downgraded: a mismatch remains a hard security error.

if [ "$#" -ne 3 ]; then
  echo 'DESKA_DEPLOY_ERROR: prepare-known-hosts.sh expects host, port, and output path.' >&2
  exit 1
fi

target_host="$1"
target_port="$2"
known_hosts_file="$3"

if ! [[ "$target_host" =~ ^[A-Za-z0-9][A-Za-z0-9.:-]*$ ]]; then
  echo 'DESKA_DEPLOY_ERROR: SERVER_HOST must be a hostname or IP address without a protocol, brackets, or whitespace.' >&2
  exit 1
fi

if ! [[ "$target_port" =~ ^[0-9]{1,5}$ ]]; then
  echo 'DESKA_DEPLOY_ERROR: SERVER_PORT must be a number between 1 and 65535.' >&2
  exit 1
fi

port_number=$((10#$target_port))
if (( port_number < 1 || port_number > 65535 )); then
  echo 'DESKA_DEPLOY_ERROR: SERVER_PORT must be a number between 1 and 65535.' >&2
  exit 1
fi

install -m 700 -d "$(dirname "$known_hosts_file")"
umask 077
input_file="$(mktemp)"
key_file="$(mktemp)"
scanned_file="$(mktemp)"
matched_file="$(mktemp)"
cleanup() {
  rm -f "$input_file" "$key_file" "$scanned_file" "$matched_file"
}
trap cleanup EXIT

# GitHub Secrets may preserve Windows line endings. Remove only CR characters;
# host keys themselves are never logged or expanded.
tr -d '\r' > "$input_file"
input_has_content=false
if grep -q '[^[:space:]#]' "$input_file"; then
  input_has_content=true
fi

scan_server_host_keys() {
  : > "$scanned_file"
  ssh-keyscan -T 30 -t ed25519,ecdsa,rsa -p "$target_port" "$target_host" 2>/dev/null > "$scanned_file" || true
}

extract_public_keys() {
  # Accept both a complete known_hosts line and a bare public-key line. We
  # retain only recognized public host keys and bind each one to the configured
  # target below.
  awk '
    function valid_type(type) {
      return type ~ /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-ssh-(ed25519|rsa)@openssh\.com)$/
    }
    function valid_key(key) {
      return key ~ /^[A-Za-z0-9+\/=]+$/
    }
    /^[[:space:]]*($|#)/ { next }
    $1 ~ /^@/ { next }
    {
      if (valid_type($1) && valid_key($2)) {
        print $1, $2
      } else if (valid_type($2) && valid_key($3)) {
        print $2, $3
      }
    }
  ' "$1" > "$key_file"
}

# Some hosting panels expose a SHA256 or MD5 fingerprint instead of the
# complete public host key. A fingerprint is an immutable verification value,
# so it is safe to retrieve candidate keys only to compare them against it.
mapfile -t sha256_fingerprints < <(grep -Eo 'SHA256:[A-Za-z0-9+/]{43}=?' "$input_file" | sort -u || true)
mapfile -t md5_fingerprints < <(grep -Eo '(MD5:)?([[:xdigit:]]{2}:){15}[[:xdigit:]]{2}' "$input_file" | sort -u || true)
fingerprint_count=$(( ${#sha256_fingerprints[@]} + ${#md5_fingerprints[@]} ))
fingerprint_hash=''
pinned_fingerprint=''

if (( fingerprint_count > 1 )); then
  echo 'DESKA_DEPLOY_ERROR: SERVER_SSH_KNOWN_HOSTS contains more than one host-key fingerprint.' >&2
  exit 1
elif (( ${#sha256_fingerprints[@]} == 1 )); then
  fingerprint_hash='sha256'
  pinned_fingerprint="${sha256_fingerprints[0]}"
elif (( ${#md5_fingerprints[@]} == 1 )); then
  fingerprint_hash='md5'
  pinned_fingerprint="MD5:${md5_fingerprints[0]#MD5:}"
  pinned_fingerprint="$(printf '%s' "$pinned_fingerprint" | tr '[:upper:]' '[:lower:]')"
fi

if [ -n "$fingerprint_hash" ]; then
  scan_server_host_keys

  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    candidate_fingerprint="$(printf '%s\n' "$candidate" | ssh-keygen -lf - -E "$fingerprint_hash" 2>/dev/null | awk 'NR == 1 { print $2 }' || true)"
    if [ "$fingerprint_hash" = 'md5' ]; then
      candidate_fingerprint="$(printf '%s' "$candidate_fingerprint" | tr '[:upper:]' '[:lower:]')"
    fi
    if [ "$candidate_fingerprint" = "$pinned_fingerprint" ]; then
      printf '%s\n' "$candidate" >> "$matched_file"
    fi
  done < "$scanned_file"

  if [ ! -s "$matched_file" ]; then
    echo 'DESKA_DEPLOY_ERROR: SERVER_SSH_KNOWN_HOSTS fingerprint did not match a host key served by the configured server.' >&2
    exit 1
  fi

  mv "$matched_file" "$input_file"
fi

extract_public_keys "$input_file"

if [ ! -s "$key_file" ]; then
  # Restore the automatic discovery used by the successful legacy workflow.
  # This is deliberately limited to the configured host and port, and all
  # following SSH operations still use StrictHostKeyChecking=yes against this
  # freshly generated known_hosts file.
  scan_server_host_keys
  extract_public_keys "$scanned_file"

  if [ ! -s "$key_file" ]; then
    echo 'DESKA_DEPLOY_ERROR: could not obtain a valid SSH host key from SERVER_HOST and SERVER_PORT. Check the server address, port, firewall, and SSH service.' >&2
    exit 1
  fi

  if [ "$input_has_content" = true ]; then
    echo 'DESKA_DEPLOY_WARNING: SERVER_SSH_KNOWN_HOSTS was not a usable host key or fingerprint; automatic server host-key discovery is being used for backward compatibility.' >&2
  else
    echo 'DESKA_DEPLOY_WARNING: SERVER_SSH_KNOWN_HOSTS is not set; automatic server host-key discovery is being used for backward compatibility.' >&2
  fi
  host_key_source='discovered'
else
  host_key_source='pinned'
fi

: > "$known_hosts_file"
chmod 600 "$known_hosts_file"
while IFS=' ' read -r key_type key_value; do
  printf '[%s]:%s %s %s\n' "$target_host" "$target_port" "$key_type" "$key_value" >> "$known_hosts_file"
  # OpenSSH uses the unbracketed form for its default port. Keep both aliases
  # so an explicit `-p 22` behaves consistently across OpenSSH versions.
  if (( port_number == 22 )); then
    printf '%s %s %s\n' "$target_host" "$key_type" "$key_value" >> "$known_hosts_file"
  fi
done < "$key_file"

target_alias="[${target_host}]:${target_port}"
if (( port_number == 22 )); then
  target_alias="$target_host"
fi

if ! ssh-keygen -F "$target_alias" -f "$known_hosts_file" >/dev/null; then
  echo 'DESKA_DEPLOY_ERROR: the pinned server key could not be normalized for SERVER_HOST and SERVER_PORT.' >&2
  exit 1
fi

if [ "$host_key_source" = 'pinned' ]; then
  echo 'DESKA_DEPLOY_STAGE: pinned server host key validated.'
else
  echo 'DESKA_DEPLOY_STAGE: server host key discovered and normalized.'
fi
