import { ScoreDecoder } from "osu-parsers"
import { ModBitwise } from "osu-classes"
import { decompress } from "lzma-js-simple-v2"

import type { SkinRuleset } from "./skin-upload"

export type DecodedScore = {
  beatmapHash: string
  username: string
  date: Date
  rank: string
  totalScore: number
  maxCombo: number
  accuracy: number
  accuracyv2: number
  mods: string[]
  countGeki: number
  countKatu: number
  count300: number
  count100: number
  count50: number
  countMiss: number
  ruleset: SkinRuleset
  isLazer: boolean
}

const MODE_RULESETS: Record<number, SkinRuleset> = {
  0: "osu",
  1: "taiko",
  2: "catch",
  3: "mania",
}

function rulesetFromModeId(modeId: number): SkinRuleset {
  return MODE_RULESETS[modeId] ?? "osu"
}

const MOD_ORDER: { bit: ModBitwise; acronym: string }[] = [
  { bit: ModBitwise.NoFail, acronym: "NF" },
  { bit: ModBitwise.Easy, acronym: "EZ" },
  { bit: ModBitwise.TouchDevice, acronym: "TD" },
  { bit: ModBitwise.Hidden, acronym: "HD" },
  { bit: ModBitwise.HardRock, acronym: "HR" },
  { bit: ModBitwise.SuddenDeath, acronym: "SD" },
  { bit: ModBitwise.Nightcore, acronym: "NC" },
  { bit: ModBitwise.DoubleTime, acronym: "DT" },
  { bit: ModBitwise.Relax, acronym: "RX" },
  { bit: ModBitwise.HalfTime, acronym: "HT" },
  { bit: ModBitwise.Flashlight, acronym: "FL" },
  { bit: ModBitwise.Autoplay, acronym: "AT" },
  { bit: ModBitwise.SpunOut, acronym: "SO" },
  { bit: ModBitwise.Relax2, acronym: "AP" },
  { bit: ModBitwise.Perfect, acronym: "PF" },
  { bit: ModBitwise.FadeIn, acronym: "FI" },
  { bit: ModBitwise.Random, acronym: "RD" },
  { bit: ModBitwise.Cinema, acronym: "CN" },
  { bit: ModBitwise.Target, acronym: "TP" },
  { bit: ModBitwise.ScoreV2, acronym: "SV2" },
  { bit: ModBitwise.Mirror, acronym: "MR" },
]

export function modsToAcronyms(rawMods: number): string[] {
  const acronyms: string[] = []
  for (const { bit, acronym } of MOD_ORDER) {
    if ((rawMods & bit) === bit) {
      acronyms.push(acronym)
    }
  }
  return acronyms.filter(
    (a) =>
      !(a === "DT" && acronyms.includes("NC")) &&
      !(a === "SD" && acronyms.includes("PF")) &&
      !(a === "AT" && acronyms.includes("CN")),
  )
}

type LazerScoreInfo = {
  mods: string[]
}

async function readLazerScoreInfo(buffer: ArrayBuffer): Promise<LazerScoreInfo | null> {
  const view = new DataView(buffer)
  let offset = 0

  const readU8 = () => view.getUint8(offset++)
  const readI32 = () => {
    const value = view.getInt32(offset, true)
    offset += 4
    return value
  }
  const readU16 = () => {
    const value = view.getUint16(offset, true)
    offset += 2
    return value
  }
  const readString = () => {
    if (readU8() !== 0x0b) return ""
    let length = 0
    let shift = 0
    while (true) {
      const byte = readU8()
      length |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    const value = new TextDecoder().decode(new Uint8Array(buffer, offset, length))
    offset += length
    return value
  }

  readU8()
  const version = readI32()

  readString()
  readString()
  readString()

  readU16()
  readU16()
  readU16()
  readU16()
  readU16()
  readU16()
  readI32()
  readU16()
  readU8()
  readI32()
  readString()
  offset += 8
  const replayLength = readI32()
  offset += replayLength

  if (version >= 20140721) offset += 8
  else if (version >= 20121008) offset += 4

  if (version < 30000001) return null

  const blobLength = readI32()
  if (blobLength <= 0) return null
  const blob = new Uint8Array(buffer, offset, blobLength)

  return decodeLazerScoreInfo(blob)
}

async function decodeLazerScoreInfo(blob: Uint8Array): Promise<LazerScoreInfo | null> {
  try {
    const decompressed = await decompress(blob)
    const json =
      typeof decompressed === "string"
        ? decompressed
        : new TextDecoder().decode(
            new Uint8Array(decompressed as ArrayLike<number>),
          )
    const parsed = JSON.parse(json) as {
      mods?: { acronym?: string }[]
    }
    if (!Array.isArray(parsed.mods)) return null
    return {
      mods: parsed.mods
        .map((mod) => (mod.acronym === "ScoreV2" ? "SV2" : mod.acronym))
        .filter((m): m is string => Boolean(m)),
    }
  } catch {
    return null
  }
}

export async function decodeReplayFile(file: File): Promise<DecodedScore> {
  const buffer = await file.arrayBuffer()
  const score = await new ScoreDecoder().decodeFromBuffer(buffer, false)
  const info = score.info
  info.passed = true

  const legacyMods = modsToAcronyms(
    typeof info.rawMods === "number" ? info.rawMods : 0,
  )
  const lazerMods = (await readLazerScoreInfo(buffer))?.mods
  const mods = lazerMods ?? legacyMods

  const isStableReplay = new DataView(buffer).getInt32(1, true) < 30000000
  if (isStableReplay && !mods.includes("CL")) {
    mods.push("CL")
  }

  const ruleset = rulesetFromModeId(typeof info.rulesetId === "number" ? info.rulesetId : 0,)

  let accuracyv2 = info.accuracy
  if (ruleset === "mania") {
    accuracyv2 = (info.countGeki * 305 + info.count300 * 300 + info.countKatu * 200 + info.count100 * 100 + info.count50 * 50) / (305 * (info.countGeki + info.count300 + info.countKatu + info.count100 + info.count50 + info.countMiss))
  }

  return {
    beatmapHash: info.beatmapHashMD5,
    username: info.username,
    date: info.date,
    rank: info.rank,
    totalScore: info.totalScore,
    maxCombo: info.maxCombo,
    accuracy: info.accuracy,
    accuracyv2: accuracyv2,
    mods: mods,
    countGeki: info.countGeki,
    countKatu: info.countKatu,
    count300: info.count300,
    count100: info.count100,
    count50: info.count50,
    countMiss: info.countMiss,
    ruleset: ruleset,
    isLazer: !isStableReplay,
  }
}