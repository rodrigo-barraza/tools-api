import crypto from "node:crypto";

// ─── Password Breach Check (k-Anonymity, No API Key) ──────────────

interface PasswordBreachResult {
  isBreached: boolean;
  breachCount: number;
  message: string;
}

export async function checkPasswordBreach(
  password: string,
): Promise<PasswordBreachResult> {
  const sha1Hash = crypto
    .createHash("sha1")
    .update(password)
    .digest("hex")
    .toUpperCase();
  const hashPrefix = sha1Hash.slice(0, 5);
  const hashSuffix = sha1Hash.slice(5);

  const response = await fetch(
    `https://api.pwnedpasswords.com/range/${hashPrefix}`,
    {
      headers: { "User-Agent": "ToolsService-BreachChecker" },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `HIBP API returned status ${response.status}: ${response.statusText}`,
    );
  }

  const responseBody = await response.text();
  const matchingLine = responseBody
    .split("\n")
    .find((line) => line.startsWith(hashSuffix));

  if (matchingLine) {
    const breachCount = parseInt(matchingLine.split(":")[1].trim(), 10);
    return {
      isBreached: true,
      breachCount,
      message: `This password has appeared in ${breachCount.toLocaleString()} data breach(es). It should not be used.`,
    };
  }

  return {
    isBreached: false,
    breachCount: 0,
    message:
      "This password was not found in any known data breaches. However, this does not guarantee it is secure.",
  };
}

// ─── Email Breach Check (Requires HIBP API Key) ───────────────────

interface EmailBreachSummary {
  name: string;
  title: string;
  domain: string;
  breachDate: string;
  addedDate: string;
  pwnCount: number;
  description: string;
  dataClasses: string[];
  isVerified: boolean;
  isSensitive: boolean;
}

interface EmailBreachResult {
  email: string;
  isBreached: boolean;
  totalBreaches: number;
  breaches: EmailBreachSummary[];
}

export async function checkEmailBreach(
  email: string,
  apiKey: string,
): Promise<EmailBreachResult> {
  const response = await fetch(
    `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
    {
      headers: {
        "User-Agent": "ToolsService-BreachChecker",
        "hibp-api-key": apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 404) {
    return {
      email,
      isBreached: false,
      totalBreaches: 0,
      breaches: [],
    };
  }

  if (!response.ok) {
    throw new Error(
      `HIBP API returned status ${response.status}: ${response.statusText}`,
    );
  }

  const breachData = (await response.json()) as EmailBreachSummary[];

  return {
    email,
    isBreached: breachData.length > 0,
    totalBreaches: breachData.length,
    breaches: breachData.map((breach) => ({
      name: breach.name,
      title: breach.title,
      domain: breach.domain,
      breachDate: breach.breachDate,
      addedDate: breach.addedDate,
      pwnCount: breach.pwnCount,
      description: breach.description,
      dataClasses: breach.dataClasses,
      isVerified: breach.isVerified,
      isSensitive: breach.isSensitive,
    })),
  };
}
