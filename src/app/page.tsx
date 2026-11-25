import { Suspense } from "react";
import { connection } from "next/server";
import BoutiqueApp from "@/components/BoutiqueApp";
import {
  getNextSerialNo,
  getSettings,
  listCustomers,
  listOrders,
} from "@/lib/db";

async function BoutiqueWorkspaceLoader() {
  await connection();
  const orders = listOrders();
  const customers = listCustomers();
  const settings = getSettings();
  const nextSerialNo = getNextSerialNo();
  const hasEnvGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  return (
    <BoutiqueApp
      initialOrders={orders}
      initialCustomers={customers}
      initialSettings={settings}
      initialNextSerialNo={nextSerialNo}
      hasEnvGeminiKey={hasEnvGeminiKey}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#faf7f2] text-sm text-[#6d6265]">
          Loading BoutiqueFlow...
        </div>
      }
    >
      <BoutiqueWorkspaceLoader />
    </Suspense>
  );
}
