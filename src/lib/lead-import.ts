import { buildPhoneMatchVariants, normalizePhone } from "./phone.ts";
import {
  generatePreviewSlug,
  hasRealWebsite,
  isQualifiedLeadPhone,
  isQualifiedMapsLead,
  isValidExternalHttpUrl,
} from "./sniper.ts";

export interface RawLeadCandidate {
  name: string;
  company?: string | null;
  phone: string;
  website?: string | null;
  address?: string | null;
  category?: string | null;
  businessStatus?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  hours?: string | null;
  previewUrl?: string | null;
  providerId?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface NormalizedLeadInsert {
  name: string;
  phone: string;
  company: string;
  website: string | null;
  address: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  hours: string | null;
  previewUrl: string | null;
  previewSlug: string | null;
  providerId: string | null;
  source: string;
  notes: string | null;
  status: "READY";
}

export interface ImportFilterOptions {
  websiteTarget?: string;
  requireMapsScore?: boolean;
  defaultSource?: string;
}

export interface LeadImportSummary {
  total: number;
  qualified: number;
  added: number;
  skippedUnqualified: number;
  skippedBlocked: number;
  skippedDuplicate: number;
}

function passesWebsiteFilter(website: string | null | undefined, websiteTarget: string): boolean {
  const realSite = hasRealWebsite(website);
  if (websiteTarget === "missing") return !realSite;
  if (websiteTarget === "present") return realSite;
  return true;
}

/**
 * Normaliza, qualifica e deduplica candidatos em memória usando as regras únicas da aplicação.
 */
export function filterQualifiedCandidates(
  candidates: RawLeadCandidate[],
  options: ImportFilterOptions = {}
): {
  qualified: NormalizedLeadInsert[];
  skippedUnqualified: number;
  skippedBatchDuplicates: number;
} {
  const websiteTarget = options.websiteTarget || "missing";
  const requireMapsScore = options.requireMapsScore ?? true;
  const defaultSource = options.defaultSource || "Importação";

  const byPhone = new Map<string, NormalizedLeadInsert>();
  let skippedUnqualified = 0;
  let skippedBatchDuplicates = 0;

  for (const item of candidates) {
    const rawName = (item.name || item.company || "").trim();
    const rawCompany = (item.company || item.name || "").trim();
    const phone = normalizePhone(item.phone || "");
    const status = (item.businessStatus || "").trim().toUpperCase();
    const website = item.website?.trim() || null;
    const rating = typeof item.rating === "number" && Number.isFinite(item.rating) ? item.rating : null;
    const reviewsCount =
      typeof item.reviewsCount === "number" && Number.isFinite(item.reviewsCount)
        ? Math.max(0, Math.round(item.reviewsCount))
        : null;

    const passes = requireMapsScore
      ? isQualifiedMapsLead({
          name: rawName,
          phone,
          website,
          businessStatus: status,
          rating,
          reviewsCount,
          websiteTarget,
        })
      : Boolean(rawName) &&
        isQualifiedLeadPhone(phone) &&
        (!status || status === "OPERATIONAL") &&
        passesWebsiteFilter(website, websiteTarget);

    if (!passes) {
      skippedUnqualified++;
      continue;
    }

    if (byPhone.has(phone)) {
      skippedBatchDuplicates++;
      continue;
    }

    const validPreview = isValidExternalHttpUrl(item.previewUrl) ? item.previewUrl!.trim().slice(0, 500) : null;
    const displayName = rawName.slice(0, 180);
    const displayCompany = rawCompany.slice(0, 180);

    byPhone.set(phone, {
      name: displayName,
      phone,
      company: displayCompany,
      website: website ? website.slice(0, 300) : null,
      address: item.address ? item.address.trim().slice(0, 300) || null : null,
      category: item.category ? item.category.trim().slice(0, 120) || null : null,
      rating,
      reviewsCount,
      hours: item.hours ? item.hours.trim().slice(0, 200) || null : null,
      previewUrl: validPreview,
      previewSlug: validPreview ? generatePreviewSlug(displayCompany || displayName, phone.slice(-5)) : null,
      providerId: item.providerId ? item.providerId.trim().slice(0, 190) || null : null,
      source: (item.source?.trim() || defaultSource).slice(0, 190),
      notes: item.notes ? item.notes.trim().slice(0, 500) || null : null,
      status: "READY",
    });
  }

  return {
    qualified: Array.from(byPhone.values()),
    skippedUnqualified,
    skippedBatchDuplicates,
  };
}

/**
 * Persiste candidatos qualificados no banco respeitando supressões e deduplicação por variantes de DDD/9o dígito.
 */
export async function importLeadCandidates(
  candidates: RawLeadCandidate[],
  options: ImportFilterOptions = {}
): Promise<LeadImportSummary> {
  const { qualified, skippedUnqualified, skippedBatchDuplicates } = filterQualifiedCandidates(candidates, options);
  if (!qualified.length) {
    return {
      total: candidates.length,
      qualified: 0,
      added: 0,
      skippedUnqualified,
      skippedBlocked: 0,
      skippedDuplicate: skippedBatchDuplicates,
    };
  }

  const allVariants = Array.from(new Set(qualified.flatMap(item => buildPhoneMatchVariants(item.phone))));
  const { db } = await import("@/lib/db");

  const [suppressed, existingLeads] = await Promise.all([
    db.suppression.findMany({ where: { phone: { in: allVariants } }, select: { phone: true } }),
    db.lead.findMany({ where: { phone: { in: allVariants } }, select: { phone: true } }),
  ]);

  const blockedSet = new Set(suppressed.map(item => item.phone));
  const existingSet = new Set(existingLeads.map(item => item.phone));

  const eligible: NormalizedLeadInsert[] = [];
  let skippedBlocked = 0;
  let skippedDuplicate = skippedBatchDuplicates;

  for (const candidate of qualified) {
    const variants = buildPhoneMatchVariants(candidate.phone);
    if (variants.some(v => blockedSet.has(v))) {
      skippedBlocked++;
      continue;
    }
    if (variants.some(v => existingSet.has(v))) {
      skippedDuplicate++;
      continue;
    }
    variants.forEach(v => existingSet.add(v));
    eligible.push(candidate);
  }

  const created = eligible.length ? await db.lead.createMany({ data: eligible, skipDuplicates: true }) : { count: 0 };

  return {
    total: candidates.length,
    qualified: qualified.length,
    added: created.count,
    skippedUnqualified,
    skippedBlocked,
    skippedDuplicate,
  };
}

