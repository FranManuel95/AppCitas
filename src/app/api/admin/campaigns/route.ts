import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { apiRequireBusinessAdmin } from "@/lib/auth/guards";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_SEGMENTS,
  getBusinessCampaigns,
  sendCampaign,
} from "@/lib/domain/campaigns";

const bodySchema = z.object({
  segment: z.enum(CAMPAIGN_SEGMENTS),
  channel: z.enum(CAMPAIGN_CHANNELS),
  subject: z.string().trim().max(150).optional(),
  body: z.string().trim().min(1).max(2000),
});

// POST /api/admin/campaigns — envía una campaña al segmento elegido (plan Pro)
export const POST = apiHandler(async (request: Request) => {
  const admin = await apiRequireBusinessAdmin();
  // Antiabuso: una ráfaga de campañas por minuto no es un caso legítimo.
  await enforceUserRateLimit(admin.id, "campaign", {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  const data = bodySchema.parse(await request.json());

  const campaign = await sendCampaign({
    businessId: admin.businessId,
    segment: data.segment,
    channel: data.channel,
    subject: data.subject,
    body: data.body,
  });

  return NextResponse.json({ campaign }, { status: 201 });
});

// GET /api/admin/campaigns — histórico
export const GET = apiHandler(async () => {
  const admin = await apiRequireBusinessAdmin();
  const campaigns = await getBusinessCampaigns(admin.businessId);
  return NextResponse.json({ campaigns });
});
