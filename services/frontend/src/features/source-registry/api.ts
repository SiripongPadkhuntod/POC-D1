export type SourceKind = "camera" | "microphone";

export type D1Source = {
  studioId: string;
  id: string;
  kind: SourceKind;
  label: string;
  websocketUrl: string;
  updatedAt: string;
};

export async function registerSource(source: Omit<D1Source, "updatedAt">) {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(source),
  });
  if (!response.ok) throw new Error((await response.json()).error ?? "register source failed");
}

export async function unregisterSource(studioId: string, id: string) {
  await fetch(`/api/sources?studioId=${encodeURIComponent(studioId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listSources(studioId: string) {
  const response = await fetch(`/api/sources?studioId=${encodeURIComponent(studioId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("load sources failed");
  return (await response.json()).sources as D1Source[];
}
