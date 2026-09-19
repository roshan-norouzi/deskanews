import { redirect } from 'next/navigation';

export default function LegacyFeedsPage() {
  redirect('/publishing/feeds');
}
