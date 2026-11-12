export interface CoverProps {
  /** Product name; defaults to "LeeTKOB". */
  name?: string;
  tagline: string;
}

/**
 * Brand cover from docs/design-system/components/Cover/preview.html: a brand slab,
 * verdict chips and an ink code panel with one evidence line, beside the product name.
 */
export function Cover({ name = 'LeeTKOB', tagline }: CoverProps) {
  return (
    <div className="lk-cover">
      <div className="lk-cover__art" aria-hidden="true">
        <svg viewBox="0 0 480 288" width="480" height="288">
          <rect className="lk-cover__brand" x="16" y="-16" width="128" height="256" rx="6" />
          <rect className="lk-cover__pass" x="160" y="32" width="48" height="24" rx="3" />
          <rect className="lk-cover__viol" x="216" y="32" width="24" height="24" rx="3" />
          <rect className="lk-cover__ev" x="160" y="176" width="96" height="64" rx="6" />
          <rect className="lk-cover__deep" x="272" y="32" width="224" height="208" rx="6" />
          <rect className="lk-cover__line" x="296" y="56" width="120" height="6" rx="3" />
          <rect className="lk-cover__line" x="312" y="72" width="96" height="6" rx="3" />
          <rect className="lk-cover__line" x="312" y="88" width="144" height="6" rx="3" />
          <rect className="lk-cover__ev" x="312" y="104" width="160" height="6" rx="3" />
          <rect className="lk-cover__line" x="312" y="120" width="72" height="6" rx="3" />
          <rect className="lk-cover__line" x="328" y="136" width="112" height="6" rx="3" />
          <rect className="lk-cover__line" x="328" y="152" width="88" height="6" rx="3" />
          <rect className="lk-cover__line" x="312" y="168" width="128" height="6" rx="3" />
          <rect className="lk-cover__line" x="312" y="184" width="64" height="6" rx="3" />
          <rect className="lk-cover__line" x="296" y="200" width="40" height="6" rx="3" />
        </svg>
      </div>
      <div className="lk-cover__words">
        <p className="lk-cover__name">{name}</p>
        <p className="lk-cover__tag">{tagline}</p>
      </div>
    </div>
  );
}
