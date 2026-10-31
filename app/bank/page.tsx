import type { Metadata } from "next";
import BankClient from "./bank-client";

export const metadata: Metadata = {
  title: "Balance & Bank | Famous Introvert",
  description: "Buy coins, check your balance and withdraw earnings.",
  alternates: { canonical: "/bank" },
};

export default function BankPage() {
  return (
    <main className="wrap">
      <section className="panel" style={{ marginBottom: 14 }}>
        <h1>Your bank</h1>
        <p className="muted">Purchase coins, watch your balance and withdraw what you earn.</p>
      </section>
      <BankClient />
    </main>
  );
}
