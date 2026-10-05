import { IconCheck } from "@/components/Icons";
import type { RetainerPackage } from "@/lib/content";

type RetainerPackageCardProps = {
  pkg: RetainerPackage;
  onSelect: () => void;
};

// Extracted verbatim from the Insights & Resources "Business Resources" tab so
// the landing page and that page render identical cards. The hardcoded palette
// is kept deliberately — unifying it with the token layer is a separate task.
export default function RetainerPackageCard({ pkg, onSelect }: RetainerPackageCardProps) {
  return (
    <div
      className={`rounded-xl p-7 border-2 flex flex-col ${
        pkg.is_active && pkg.display_order === 2
          ? "bg-[#0d1f3c] border-[#c9a84c]"
          : "bg-white border-[#e8e4dc]"
      }`}
    >
      {pkg.display_order === 2 && (
        <span className="text-xs font-semibold bg-[#c9a84c] text-[#0d1f3c] px-3 py-1 rounded-full self-start mb-5">
          Most Popular
        </span>
      )}
      <h3
        className={`font-serif text-2xl font-bold mb-1 ${
          pkg.display_order === 2 ? "text-white" : "text-[#0d1f3c]"
        }`}
      >
        {pkg.name}
      </h3>
      {pkg.tagline && (
        <p
          className={`text-xs uppercase tracking-wide mb-2 ${
            pkg.display_order === 2 ? "text-[#c9a84c]" : "text-[#c9a84c]"
          }`}
        >
          {pkg.tagline}
        </p>
      )}
      <p
        className={`text-sm mb-5 ${
          pkg.display_order === 2 ? "text-white/60" : "text-[#8a9ab5]"
        }`}
      >
        {pkg.description}
      </p>
      {/* price_display holds the text the firm wants shown ("From ₱25,000/mo",
          "Contact for quote"). `price` is a numeric column and is empty for
          every seeded package, so the cards used to render a blank line. */}
      <div className="text-sm font-semibold mb-6 text-[#c9a84c]">
        {pkg.price_display ||
          (pkg.price != null && String(pkg.price).trim() !== ""
            ? `₱${pkg.price}`
            : "Contact for quote")}
      </div>
      <ul className="space-y-3 flex-1 mb-6">
        {(pkg.features || []).map((f) => (
          <li key={f} className="flex items-start gap-3">
            <IconCheck
              className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                pkg.display_order === 2 ? "text-[#c9a84c]" : "text-[#c9a84c]"
              }`}
            />
            <span
              className={`text-sm ${
                pkg.display_order === 2 ? "text-white/80" : "text-[#2c3347]"
              }`}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onSelect}
        className={`w-full py-3 rounded text-sm font-semibold transition-colors ${
          pkg.display_order === 2
            ? "bg-[#c9a84c] hover:bg-[#e2c87a] text-[#0d1f3c]"
            : "border border-[#0d1f3c] text-[#0d1f3c] hover:bg-[#0d1f3c] hover:text-white"
        }`}
      >
        {pkg.cta_text}
      </button>
    </div>
  );
}
