import { redirect } from 'next/navigation';
// Middleware enforces auth; authenticated users land on the calendar.
export default function Home() { redirect('/calendar'); }
