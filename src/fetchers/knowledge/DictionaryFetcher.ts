import { stripHtml } from "@rodrigo-barraza/utilities-library";
import { DICTIONARY_BASE_URL } from "../../constants.ts";

/**
 * Free Dictionary API fetcher.
 * https://dictionaryapi.dev/ — no auth, fully open.
 * Returns definitions, phonetics, pronunciation audio, synonyms, antonyms.
 */

export interface DictionaryPhonetic {
  text: string | null;
  audio: string | null;
}

export interface DictionaryDefinition {
  definition: string;
  example: string | null;
  synonyms: string[];
  antonyms: string[];
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
  synonyms: string[];
  antonyms: string[];
}

export interface DictionaryEntrySuccess {
  word: string;
  found: true;
  phonetic: string | null;
  phonetics: DictionaryPhonetic[];
  meanings: DictionaryMeaning[];
  sourceUrls: string[];
}

export interface DictionaryEntryNotFound {
  word: string;
  found: false;
  message: string;
}

export type DictionaryEntryResult =
  | DictionaryEntrySuccess
  | DictionaryEntryNotFound;

interface RawPhonetic {
  text?: string;
  audio?: string;
}

interface RawDefinition {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
}

interface RawMeaning {
  partOfSpeech: string;
  definitions: RawDefinition[];
  synonyms?: string[];
  antonyms?: string[];
}

interface RawEntry {
  word: string;
  phonetic?: string;
  phonetics?: RawPhonetic[];
  meanings?: RawMeaning[];
  sourceUrls?: string[];
}

/**
 * Look up a word and return structured definition data.
 */
export async function fetchDefinition(
  word: string,
): Promise<DictionaryEntryResult> {
  const url = `${DICTIONARY_BASE_URL}/${encodeURIComponent(word.toLowerCase().trim())}`;
  const response = await fetch(url);
  if (response.status === 404) {
    return { word, found: false, message: "Word not found" };
  }
  if (!response.ok) {
    throw new Error(
      `Dictionary API → ${response.status} ${response.statusText}`,
    );
  }
  const data: RawEntry[] = await response.json();
  const entry = data[0];

  // Extract phonetics with audio
  const phonetics = (entry.phonetics || [])
    .filter((rawPhonetic: RawPhonetic) => rawPhonetic.text || rawPhonetic.audio)
    .map((rawPhonetic: RawPhonetic) => ({
      text: rawPhonetic.text || null,
      audio: rawPhonetic.audio || null,
    }));

  // Extract meanings grouped by part of speech
  const meanings = (entry.meanings || []).map((rawMeaning: RawMeaning) => ({
    partOfSpeech: rawMeaning.partOfSpeech,
    definitions: (rawMeaning.definitions || []).slice(0, 5).map((rawDefinition: RawDefinition) => ({
      definition: stripHtml(rawDefinition.definition),
      example: rawDefinition.example ? stripHtml(rawDefinition.example) : null,
      synonyms: (rawDefinition.synonyms || []).slice(0, 5),
      antonyms: (rawDefinition.antonyms || []).slice(0, 5),
    })),
    synonyms: (rawMeaning.synonyms || []).slice(0, 10),
    antonyms: (rawMeaning.antonyms || []).slice(0, 10),
  }));

  return {
    word: entry.word,
    found: true,
    phonetic: entry.phonetic || phonetics[0]?.text || null,
    phonetics,
    meanings,
    sourceUrls: entry.sourceUrls || [],
  };
}
