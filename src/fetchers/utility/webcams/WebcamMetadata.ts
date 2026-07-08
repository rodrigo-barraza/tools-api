export interface WebcamSourceMetadata {
  key: string;
  city?: string;
  state?: string;
  province?: string;
  region?: string;
  country: string; // ISO 2-letter country code
  sourceCity: string; // The original city field written by source ingestion
}

export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  canada: "CA",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  ireland: "IE",
  germany: "DE",
  finland: "FI",
  australia: "AU",
  "new zealand": "NZ",
  singapore: "SG",
};

export const WEBCAM_METADATA_LIST: WebcamSourceMetadata[] = [
  // ─── Canada ──────────────────────────────────────────────────────
  { key: "vancouver", city: "Vancouver", province: "British Columbia", country: "CA", sourceCity: "Vancouver" },
  { key: "toronto", city: "Toronto", province: "Ontario", country: "CA", sourceCity: "Toronto" },
  { key: "calgary", city: "Calgary", province: "Alberta", country: "CA", sourceCity: "Calgary" },
  { key: "ottawa", city: "Ottawa", province: "Ontario", country: "CA", sourceCity: "Ottawa" },
  { key: "hamilton", city: "Hamilton", province: "Ontario", country: "CA", sourceCity: "Hamilton" },
  { key: "london-on", city: "London", province: "Ontario", country: "CA", sourceCity: "London" },
  { key: "kingston", city: "Kingston", province: "Ontario", country: "CA", sourceCity: "Kingston" },
  { key: "windsor-on", city: "Windsor", province: "Ontario", country: "CA", sourceCity: "Windsor" },
  { key: "kitchener", city: "Kitchener", province: "Ontario", country: "CA", sourceCity: "Kitchener" },
  { key: "barrie", city: "Barrie", province: "Ontario", country: "CA", sourceCity: "Barrie" },
  { key: "thunder-bay", city: "Thunder Bay", province: "Ontario", country: "CA", sourceCity: "Thunder Bay" },
  { key: "sudbury", city: "Sudbury", province: "Ontario", country: "CA", sourceCity: "Sudbury" },
  { key: "niagara", city: "Niagara Falls", province: "Ontario", country: "CA", sourceCity: "Niagara" },
  { key: "mississauga", city: "Mississauga", province: "Ontario", country: "CA", sourceCity: "Mississauga" },
  { key: "edmonton", city: "Edmonton", province: "Alberta", country: "CA", sourceCity: "Edmonton" },
  { key: "red-deer", city: "Red Deer", province: "Alberta", country: "CA", sourceCity: "Red Deer" },
  { key: "lethbridge", city: "Lethbridge", province: "Alberta", country: "CA", sourceCity: "Lethbridge" },
  { key: "medicine-hat", city: "Medicine Hat", province: "Alberta", country: "CA", sourceCity: "Medicine Hat" },
  { key: "grande-prairie", city: "Grande Prairie", province: "Alberta", country: "CA", sourceCity: "Grande Prairie" },
  { key: "banff", city: "Banff", province: "Alberta", country: "CA", sourceCity: "Banff" },
  { key: "fort-mcmurray", city: "Fort McMurray", province: "Alberta", country: "CA", sourceCity: "Fort McMurray" },
  { key: "quebec", province: "Quebec", country: "CA", sourceCity: "Quebec" },
  { key: "british-columbia", province: "British Columbia", country: "CA", sourceCity: "British Columbia" },

  // ─── US ──────────────────────────────────────────────────────────
  { key: "seattle", city: "Seattle", state: "Washington", country: "US", sourceCity: "Seattle" },
  { key: "austin", city: "Austin", state: "Texas", country: "US", sourceCity: "Austin" },
  { key: "baton-rouge", city: "Baton Rouge", state: "Louisiana", country: "US", sourceCity: "Baton Rouge" },
  { key: "nyc", city: "New York City", state: "New York", country: "US", sourceCity: "New York City" },
  { key: "buffalo", city: "Buffalo", state: "New York", country: "US", sourceCity: "Buffalo" },
  { key: "syracuse", city: "Syracuse", state: "New York", country: "US", sourceCity: "Syracuse" },
  { key: "albany", city: "Albany", state: "New York", country: "US", sourceCity: "Albany" },
  { key: "rochester", city: "Rochester", state: "New York", country: "US", sourceCity: "Rochester" },
  { key: "long-island", region: "Long Island", state: "New York", country: "US", sourceCity: "Long Island" },
  { key: "westchester", region: "Westchester", state: "New York", country: "US", sourceCity: "Westchester" },
  { key: "utica", city: "Utica", state: "New York", country: "US", sourceCity: "Utica" },
  { key: "binghamton", city: "Binghamton", state: "New York", country: "US", sourceCity: "Binghamton" },
  { key: "ithaca", city: "Ithaca", state: "New York", country: "US", sourceCity: "Ithaca" },
  { key: "washington-dc", city: "Washington", state: "District of Columbia", country: "US", sourceCity: "Washington DC" },
  { key: "honolulu", city: "Honolulu", state: "Hawaii", country: "US", sourceCity: "Honolulu" },
  { key: "chicago", city: "Chicago", state: "Illinois", country: "US", sourceCity: "Chicago" },
  { key: "florida", state: "Florida", country: "US", sourceCity: "Florida" },
  { key: "iowa", state: "Iowa", country: "US", sourceCity: "Iowa" },
  { key: "california", state: "California", country: "US", sourceCity: "California" },
  { key: "washington-state", state: "Washington", country: "US", sourceCity: "Washington" },
  { key: "oregon", state: "Oregon", country: "US", sourceCity: "Oregon" },
  { key: "michigan", state: "Michigan", country: "US", sourceCity: "Michigan" },
  { key: "kentucky", state: "Kentucky", country: "US", sourceCity: "Kentucky" },
  { key: "montgomery-county-tx", region: "Montgomery County", state: "Texas", country: "US", sourceCity: "Montgomery County TX" },

  // ─── International ────────────────────────────────────────────────
  { key: "queensland", state: "Queensland", country: "AU", sourceCity: "Queensland" },
  { key: "new-zealand", country: "NZ", sourceCity: "New Zealand" },
  { key: "london", city: "London", country: "GB", sourceCity: "London" },
  { key: "germany", country: "DE", sourceCity: "Germany" },
  { key: "finland", country: "FI", sourceCity: "Finland" },
  { key: "donegal", region: "Donegal", country: "IE", sourceCity: "Donegal" },
  { key: "singapore", country: "SG", sourceCity: "Singapore" },
];

export function getMetadataBySource(city: string, country: string): WebcamSourceMetadata | undefined {
  const normalizedCity = city.toLowerCase().trim();
  const normalizedCountry = country.toUpperCase().trim();

  // Find direct match first
  return WEBCAM_METADATA_LIST.find(
    (meta) =>
      meta.sourceCity.toLowerCase() === normalizedCity &&
      meta.country === normalizedCountry
  );
}

export function getMetadataByRegistryKey(key: string): WebcamSourceMetadata | undefined {
  const normalizedKey = key.toLowerCase().trim();
  return WEBCAM_METADATA_LIST.find((meta) => meta.key === normalizedKey);
}
