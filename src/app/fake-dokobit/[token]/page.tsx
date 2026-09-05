import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isFakeDokobit } from "@/lib/dokobit";
import { readFakeSigning } from "@/lib/dokobit/fake";
import { FakeSigningView } from "@/components/fake-signing-view";

export const metadata: Metadata = {
  title: "Simulated signing",
  robots: { index: false, follow: false },
};

/**
 * Dev-only stand-in for the page Dokobit would host: where the signing link
 * from a locally faked "Sign with Dokobit" lands. Renders the document that
 * would have been sent and lets you simulate the signature, so the whole flow
 * is clickable with no Dokobit account.
 *
 * 404s unless the app is running on the fake gateway, so a real deployment
 * never serves this route.
 */
export default async function FakeSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isFakeDokobit()) {
    notFound();
  }

  const { token } = await params;
  const signing = await readFakeSigning(token);
  if (!signing) {
    notFound();
  }

  return <FakeSigningView signing={signing} />;
}
