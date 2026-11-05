import { NextResponse } from "next/server";
import { authorized, unauthorized } from "@/lib/auth";

export async function GET() {
  if (!await authorized()) return unauthorized();
  return NextResponse.json({
    automationEnabled: process.env.AUTOMATION_ENABLED === "true",
    businessName: process.env.BUSINESS_NAME || "Sua empresa",
    businessOffer: process.env.BUSINESS_OFFER || "Serviços profissionais",
  });
}

