import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";

const PROMOS_URL =
  "https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json";
const ADVANCE_MS = 6000;

type Promo = {
  image_url?: string;
  title: string;
  body?: string;
  link: string;
  active?: boolean;
};

function isPromo(value: unknown): value is Promo {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Promo;
  return typeof p.title === "string" && typeof p.link === "string";
}

export function PromoCarousel() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [hidden, setHidden] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(PROMOS_URL, { signal: controller.signal });
        if (!res.ok) return;
        const data: unknown = await res.json();
        const active = Array.isArray(data)
          ? data.filter((item): item is Promo => isPromo(item) && item.active !== false)
          : [];
        if (active.length === 0) return;
        setPromos(active);
        setHidden(false);
      } catch {
        // Network/CSP failure -> keep the section hidden.
      }
    })();
    return () => controller.abort();
  }, []);

  const count = promos.length;
  const promo = promos[index] ?? promos[0];

  useEffect(() => {
    if (hidden || count < 2 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(id);
  }, [hidden, count, paused]);

  if (hidden || !promo) return null;

  return (
    <div
      className="promo-carousel relative flex flex-col gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        onClick={() => openUrl(promo.link).catch(() => {})}
        className="group relative flex aspect-[4/3] w-full flex-col justify-end overflow-hidden rounded-lg border-2 border-background bg-surface text-left transition-all hover:shadow-soft cursor-pointer"
        title={promo.title}
      >
        {promo.image_url && (
          <img
            src={promo.image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 inset-highlight bg-gradient-to-t from-surface to-transparent"
        />
        <span className="relative flex flex-col gap-0.5 p-3">
          <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {promo.title}
            <ArrowSquareOut className="size-3.5 text-muted-foreground transition-colors group-hover:text-accent" weight="bold" />
          </span>
          {promo.body && (
            <span className="text-xs leading-normal text-muted-foreground">
              {promo.body}
            </span>
          )}
        </span>
      </button>

      {count > 1 && (
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            aria-label="Previous promo"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="flex size-6 items-center justify-center rounded-md border-2 border-background bg-surface text-muted-foreground transition-all hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5" weight="bold" />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Promo dots">
            {promos.map((p, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Promo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  i === index
                    ? "w-4 bg-accent accent-glow"
                    : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next promo"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="flex size-6 items-center justify-center rounded-md border-2 border-background bg-surface text-muted-foreground transition-all hover:text-foreground cursor-pointer"
          >
            <ArrowRight className="size-3.5" weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}

export default PromoCarousel;
