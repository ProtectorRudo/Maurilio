import PaymentReturn from "@/components/PaymentReturn";

export const metadata = { robots: { index: false, follow: false } };

export default function PendingPage() {
  return <PaymentReturn state="pending" />;
}
