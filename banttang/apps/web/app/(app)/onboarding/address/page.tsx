import { AddressOnboardingClient } from "@/components/AddressOnboardingClient";
import { requireCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AddressOnboardingPage() {
  const me = await requireCurrentUser();
  return <AddressOnboardingClient userId={me.id} />;
}
