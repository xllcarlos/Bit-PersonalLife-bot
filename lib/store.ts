import { Redis } from "@upstash/redis";
import { randomBytes } from "crypto";
import { config } from "./config";
import type { PendingAction } from "./types";

const PENDING_TTL = 60 * 60; // 1h
const CONTEXT_TTL = 30 * 60; // 30min
const UPDATE_TTL = 5 * 60;

let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis === undefined) {
    redis =
      config.redis.url && config.redis.token
        ? new Redis({ url: config.redis.url, token: config.redis.token })
        : null;
  }
  return redis;
}

/** Sem Redis, usamos memória local: funciona em `npm run dev`, mas NÃO é confiável na Vercel. */
export function isPersistent(): boolean {
  return getRedis() !== null;
}

const memory = new Map<string, { value: unknown; expires: number }>();

function memRead(key: string): unknown {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

async function setValue(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (r) await r.set(key, value, { ex: ttlSeconds });
  else memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

async function getValue<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r) return (await r.get<T>(key)) ?? null;
  return (memRead(key) as T | null) ?? null;
}

/** Lê e apaga numa operação só, impedindo que um duplo clique execute a ação duas vezes. */
async function takeValue<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (r) return (await r.getdel<T>(key)) ?? null;
  const value = memRead(key) as T | null;
  memory.delete(key);
  return value ?? null;
}

async function deleteValue(key: string): Promise<void> {
  const r = getRedis();
  if (r) await r.del(key);
  else memory.delete(key);
}

export async function savePending(action: PendingAction, id?: string): Promise<string> {
  const finalId = id ?? randomBytes(6).toString("hex");
  await setValue(`pending:${finalId}`, action, PENDING_TTL);
  return finalId;
}

export function takePending(id: string): Promise<PendingAction | null> {
  return takeValue<PendingAction>(`pending:${id}`);
}

/** Resumo da última proposta, para o Gemini entender respostas como "joga pra sexta". */
export function saveContext(chatId: number, summary: string): Promise<void> {
  return setValue(`context:${chatId}`, summary, CONTEXT_TTL);
}

export function getContext(chatId: number): Promise<string | null> {
  return getValue<string>(`context:${chatId}`);
}

export function clearContext(chatId: number): Promise<void> {
  return deleteValue(`context:${chatId}`);
}

/** true se este update do Telegram ainda não foi processado (evita duplicidade em reenvios). */
export async function markUpdateSeen(updateId: number): Promise<boolean> {
  const key = `update:${updateId}`;
  const r = getRedis();
  if (r) {
    const res = await r.set(key, 1, { nx: true, ex: UPDATE_TTL });
    return res === "OK";
  }
  if (memRead(key)) return false;
  memory.set(key, { value: 1, expires: Date.now() + UPDATE_TTL * 1000 });
  return true;
}
