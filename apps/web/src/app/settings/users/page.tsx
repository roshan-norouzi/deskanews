import { redirect } from 'next/navigation';

export default function SettingsUsersRedirectPage() {
  redirect('/settings?tab=users');
}
