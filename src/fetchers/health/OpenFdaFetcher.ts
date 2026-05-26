import { OPEN_FDA_BASE_URL } from "../../constants.ts";

/**
 * openFDA API fetcher.
 * https://open.fda.gov/apis/ — no auth required (40 req/min),
 * optional API key bumps to 240 req/min (not needed for our use case).
 * Returns drug labels, adverse events, recalls.
 */

// ─── Interfaces ───────────────────────────────────────────────────

export interface RawFdaDrugLabel {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    route?: string[];
    substance_name?: string[];
    product_type?: string[];
  };
  indications_and_usage?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  dosage_and_administration?: string[];
  contraindications?: string[];
  drug_interactions?: string[];
  pregnancy?: string[];
  storage_and_handling?: string[];
}

export interface FdaDrugLabelNormalized {
  brandName: string | null;
  genericName: string | null;
  manufacturer: string | null;
  route: string[];
  substanceName: string[];
  productType: string | null;
  indications: string | null;
  warnings: string | null;
  adverseReactions: string | null;
  dosage: string | null;
  contraindications: string | null;
  drugInteractions: string | null;
  pregnancyWarning: string | null;
  storageHandling: string | null;
}

export interface RawFdaAdverseEvent {
  safetyreportid?: string | null;
  receivedate?: string | null;
  serious?: string | null;
  seriousnessdeath?: string | null;
  seriousnesshospitalization?: string | null;
  seriousnesslifethreatening?: string | null;
  seriousnessdisabling?: string | null;
  patient?: {
    reaction?: Array<{ reactionmeddrapt?: string | null }>;
    patientonsetage?: string | null;
    patientsex?: string | null;
  };
}

export interface FdaAdverseEventNormalized {
  safetyReportId: string | null;
  receiveDate: string | null;
  serious: boolean | null;
  seriousnessDetails: {
    death: boolean;
    hospitalization: boolean;
    lifeThreatening: boolean;
    disability: boolean;
  };
  reactions: string[];
  patientAge: string | null;
  patientSex: string | null;
}

export interface RawFdaRecall {
  recall_number?: string | null;
  status?: string | null;
  classification?: string | null;
  report_date?: string | null;
  recalling_firm?: string | null;
  reason_for_recall?: string | null;
  product_description?: string | null;
  distribution_pattern?: string | null;
  voluntary_mandated?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface FdaRecallNormalized {
  recallNumber: string | null;
  status: string | null;
  classification: string | null;
  reportDate: string | null;
  recallingFirm: string | null;
  reason: string | null;
  productDescription: string | null;
  distribution: string | null;
  voluntaryMandated: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface FdaMetaResponse {
  meta?: {
    results?: {
      total?: number;
    };
  };
}

interface FdaLabelApiResponse extends FdaMetaResponse {
  results?: RawFdaDrugLabel[];
}

interface FdaEventApiResponse extends FdaMetaResponse {
  results?: RawFdaAdverseEvent[];
}

interface FdaRecallApiResponse extends FdaMetaResponse {
  results?: RawFdaRecall[];
}

// ─── Helpers ───────────────────────────────────────────────────────

function normalizeDrugLabel(r: RawFdaDrugLabel): FdaDrugLabelNormalized {
  return {
    brandName: r.openfda?.brand_name?.[0] || null,
    genericName: r.openfda?.generic_name?.[0] || null,
    manufacturer: r.openfda?.manufacturer_name?.[0] || null,
    route: r.openfda?.route || [],
    substanceName: r.openfda?.substance_name || [],
    productType: r.openfda?.product_type?.[0] || null,
    indications: r.indications_and_usage?.[0] || null,
    warnings: r.warnings?.[0] || null,
    adverseReactions: r.adverse_reactions?.[0] || null,
    dosage: r.dosage_and_administration?.[0] || null,
    contraindications: r.contraindications?.[0] || null,
    drugInteractions: r.drug_interactions?.[0] || null,
    pregnancyWarning: r.pregnancy?.[0] || null,
    storageHandling: r.storage_and_handling?.[0] || null,
  };
}

// ─── Search Drug Labels ────────────────────────────────────────────

/**
 * Search FDA drug labels by name (brand or generic).
 */
export async function searchDrugLabels(query: string, limit = 5) {
  const searchTerm = encodeURIComponent(
    `openfda.brand_name:"${query}"+openfda.generic_name:"${query}"`,
  );
  const url = `${OPEN_FDA_BASE_URL}/drug/label.json?search=${searchTerm}&limit=${Math.min(limit, 20)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, query, drugs: [] as FdaDrugLabelNormalized[] };
  }
  if (!response.ok) {
    throw new Error(`openFDA drug labels → ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FdaLabelApiResponse;

  return {
    found: true,
    totalResults: data.meta?.results?.total || 0,
    drugs: (data.results || []).slice(0, limit).map(normalizeDrugLabel),
  };
}

// ─── Get Drug Adverse Events ───────────────────────────────────────

/**
 * Get adverse event reports for a drug.
 */
export async function getDrugAdverseEvents(drugName: string, limit = 10) {
  const searchTerm = encodeURIComponent(
    `patient.drug.openfda.brand_name:"${drugName}"+patient.drug.openfda.generic_name:"${drugName}"`,
  );
  const url = `${OPEN_FDA_BASE_URL}/drug/event.json?search=${searchTerm}&limit=${Math.min(limit, 25)}`;
  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, drugName, events: [] as FdaAdverseEventNormalized[] };
  }
  if (!response.ok) {
    throw new Error(`openFDA adverse events → ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FdaEventApiResponse;

  return {
    found: true,
    totalResults: data.meta?.results?.total || 0,
    events: (data.results || []).slice(0, limit).map((item: RawFdaAdverseEvent) => ({
      safetyReportId: item.safetyreportid || null,
      receiveDate: item.receivedate || null,
      serious: item.serious ? parseInt(item.serious, 10) === 1 : null,
      seriousnessDetails: {
        death: item.seriousnessdeath === "1",
        hospitalization: item.seriousnesshospitalization === "1",
        lifeThreatening: item.seriousnesslifethreatening === "1",
        disability: item.seriousnessdisabling === "1",
      },
      reactions: (item.patient?.reaction || [])
        .map((r) => r.reactionmeddrapt)
        .filter((r): r is string => typeof r === "string")
        .slice(0, 10),
      patientAge: item.patient?.patientonsetage || null,
      patientSex:
        item.patient?.patientsex === "1"
          ? "Male"
          : item.patient?.patientsex === "2"
            ? "Female"
            : null,
    })),
  };
}

// ─── Get Drug Recalls ──────────────────────────────────────────────

/**
 * Get FDA drug recall enforcement actions.
 */
export async function getDrugRecalls(query: string, limit = 10) {
  let url = `${OPEN_FDA_BASE_URL}/drug/enforcement.json?`;

  if (query) {
    url += `search=reason_for_recall:"${encodeURIComponent(query)}"+openfda.brand_name:"${encodeURIComponent(query)}"&`;
  }
  url += `limit=${Math.min(limit, 25)}&sort=report_date:desc`;

  const response = await fetch(url);

  if (response.status === 404) {
    return { found: false, recalls: [] as FdaRecallNormalized[] };
  }
  if (!response.ok) {
    throw new Error(`openFDA recalls → ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FdaRecallApiResponse;

  return {
    found: true,
    totalResults: data.meta?.results?.total || 0,
    recalls: (data.results || []).slice(0, limit).map((r: RawFdaRecall) => ({
      recallNumber: r.recall_number || null,
      status: r.status || null,
      classification: r.classification || null,
      reportDate: r.report_date || null,
      recallingFirm: r.recalling_firm || null,
      reason: r.reason_for_recall || null,
      productDescription: r.product_description || null,
      distribution: r.distribution_pattern || null,
      voluntaryMandated: r.voluntary_mandated || null,
      city: r.city || null,
      state: r.state || null,
      country: r.country || null,
    })),
  };
}
