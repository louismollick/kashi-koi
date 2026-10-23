import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useScrollElement } from './Screen';

/** Rows or grid rows laid out by absolute offsets inside the screen's scroller. */
function Rows({
  count,
  rowHeight,
  render,
  className,
}: {
  count: number;
  rowHeight: number;
  render: (index: number) => ReactNode;
  className?: string;
}) {
  const scroller = useScrollElement();
  const list = useRef<HTMLDivElement>(null);
  // Content above the list (search, filters) scrolls with it, so the list starts this far into the scroller.
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    if (list.current && list.current.offsetTop !== margin) setMargin(list.current.offsetTop);
  });
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller,
    estimateSize: () => rowHeight,
    overscan: 8,
    scrollMargin: margin,
  });
  return (
    <div ref={list} className={className} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          className="absolute top-0 left-0 w-full"
          style={{ height: rowHeight, transform: `translateY(${row.start - margin}px)` }}
        >
          {render(row.index)}
        </div>
      ))}
    </div>
  );
}

/** A long list of equal-height rows. Only the rows near the viewport are in the DOM. */
export function VirtualList<T>({
  items,
  rowHeight,
  renderItem,
}: {
  items: readonly T[];
  rowHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <Rows
      count={items.length}
      rowHeight={rowHeight}
      render={(index) => {
        const item = items[index];
        return item === undefined ? null : renderItem(item, index);
      }}
    />
  );
}

/**
 * A long grid of tiles that fills the width: as many columns of at least `minTile` px as fit, tiles stretched to use
 * the width exactly. `tileHeight` is the height of a tile of the computed width; rows are `rowGap` apart.
 */
export function VirtualGrid<T>({
  items,
  minTile,
  gap = 12,
  rowGap = 16,
  tileHeight,
  getKey,
  renderItem,
}: {
  items: readonly T[];
  minTile: number;
  gap?: number;
  rowGap?: number;
  tileHeight: (size: number) => number;
  getKey: (item: T) => string;
  renderItem: (item: T, size: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const { columns, size } = gridLayout(width, minTile, gap);
  const rows = Math.ceil(items.length / columns);
  return (
    <div ref={box}>
      {width > 0 && (
        <Rows
          count={rows}
          rowHeight={tileHeight(size) + rowGap}
          render={(row) => (
            <div
              className="grid items-start justify-between"
              style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)`, columnGap: gap }}
            >
              {items.slice(row * columns, (row + 1) * columns).map((item) => (
                <div key={getKey(item)}>{renderItem(item, size)}</div>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}

/** Columns and whole-pixel tile size for a container width: at least `minTile` wide, using the full width. */
export function gridLayout(width: number, minTile: number, gap: number) {
  const columns = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
  return { columns, size: Math.max(1, Math.floor((width - gap * (columns - 1)) / columns)) };
}
