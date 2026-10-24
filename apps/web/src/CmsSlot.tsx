import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, asset } from "./api";

export function useBanners(group: string) {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    const platform = window.matchMedia("(max-width: 640px)").matches ? "mobile" : "web";
    api(`/api/cms/banners?group=${group}&platform=${platform}`).then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
  }, [group]);
  return list;
}

/** Banner linki: site içi ise router, dışarı ise yeni sekme */
export function BLink({ to, className, children }: { to?: string | null; className?: string; children: React.ReactNode }) {
  if (!to) return <div className={className}>{children}</div>;
  if (/^https?:\/\//.test(to)) return <a href={to} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  return <Link to={to} className={className}>{children}</Link>;
}



/** Sayfa üstü banner şeridi — içeriği backoffice › CMS › Bannerlar'daki ilgili alandan gelir; boşsa hiç yer kaplamaz */
export function BannerSlot({ group, className = "" }: { group: string; className?: string }) {
  const list = useBanners(group);
  if (!list?.length) return null;
  return (
    <div className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto ${className}`}>
      {list.map((b) => (
        <BLink key={b.id} to={b.linkUrl} className={`group relative isolate block h-[120px] shrink-0 snap-start overflow-hidden rounded-2xl sm:h-[150px] ${list.length > 1 ? "w-[88%] md:w-[calc((100%-12px)/2)]" : "w-full"}`}>
          <div className="absolute inset-0 -z-20" style={{ background: b.bgColor || "#131a22" }} />
          {b.imageUrl && <img src={asset(b.imageUrl)} alt="" className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
          <div className="flex h-full max-w-[70%] flex-col justify-center gap-1 px-5 sm:px-7">
            {b.subtitle && <span className="text-[12px] font-bold text-white/75">{b.subtitle}</span>}
            <span className="text-[22px] font-bold leading-tight text-white sm:text-[26px]">{b.title}</span>
            {b.highlight && <span className="text-[22px] font-bold leading-tight text-caution sm:text-[26px]">{b.highlight}</span>}
            {b.ctaText && <span className="btn btn-primary btn-sm mt-2 w-fit">{b.ctaText}</span>}
          </div>
          {b.badge && <span className="absolute right-3 top-3 rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-fg">{b.badge}</span>}
        </BLink>
      ))}
    </div>
  );
}

/** Giriş/kayıt penceresi görseli */
export function BannerImage({ group, className = "" }: { group: string; className?: string }) {
  const list = useBanners(group);
  const b = list?.[0];
  if (!b?.imageUrl) return null;
  return <img src={asset(b.imageUrl)} alt="" className={className} />;
}
