import { redirect } from 'next/navigation';

/** Compatibility route for bookmarks from the retired generic channel screen. */
export default function LegacyChannelsPage() {
  redirect('/publishing/settings');
}
