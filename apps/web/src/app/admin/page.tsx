import { redirect } from 'next/navigation';

/** Legacy / bookmark entry — main app lives at /dashboard */
export default function AdminPage() {
  redirect('/dashboard');
}
