import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

const PROMOS_URL =
  "https://raw.githubusercontent.com/Elixir-Piloting/Reel/master/promos.json";
const ADVANCE_MS = 6000;

type PromoType = "image" | "video";

type Promo = {
  type?: PromoType;
  media_url?: string;
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
        const res = await fetch(PROMOS_URL, { cache: "no-store", signal: controller.signal });
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
  const isVideo = promo?.type === "video";

  useEffect(() => {
    if (hidden || count < 2 || paused || isVideo) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ADVANCE_MS);
    return () => clearInterval(id);
  }, [hidden, count, paused, index, isVideo]);

  if (hidden || !promo) return null;

  return (
    <div
      className="promo-carousel relative flex flex-col gap-2"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => openUrl(promo.link).catch(() => {})}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openUrl(promo.link).catch(() => {});
          }
        }}
        className="group w-full cursor-pointer overflow-hidden rounded-md border-4 border-background bg-surface text-left transition-all hover:shadow-soft"
        title={promo.title}
      >
        {isVideo ? (
          <video
            key={promo.media_url}
            src={promo.media_url}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => setIndex((i) => (i + 1) % count)}
            onError={() => {
              if (count > 1) setIndex((i) => (i + 1) % count);
            }}
            className="w-full rounded-md"
          />
        ) : (
          promo.media_url && (
            <img
              src={promo.media_url}
              alt=""
              className="w-full rounded-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )
        )}
        <div className="mt-2 px-3 pb-3">
          <span className="block text-sm font-semibold text-foreground">
            {promo.title}
          </span>
          {promo.body && (
            <span className="mt-0.5 block text-xs leading-normal text-muted-foreground">
              {promo.body}
            </span>
          )}
        </div>
      </div>

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
          <div className="flex items-center gap-1.5">
            {promos.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Promo ${i + 1}`}
                aria-current={i === index ? "true" : "false"}
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
