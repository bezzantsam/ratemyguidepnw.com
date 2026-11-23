'use client';

import {useLayoutEffect, useRef, type RefObject} from 'react';

type DirectoryPagerProps = {
  page: number;
  pages: number;
  listRef: RefObject<HTMLDivElement | null>;
  onPageChange: (page: number) => void;
};

export default function DirectoryPager({page, pages, listRef, onPageChange}: DirectoryPagerProps) {
  const requestedPage = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (requestedPage.current !== page) return;
    requestedPage.current = null;
    const list = listRef.current;
    list?.querySelector<HTMLAnchorElement>('a[href]')?.focus({preventScroll: true});
    list?.scrollIntoView({block: 'start'});
  }, [page, listRef]);

  function goToPage(next: number) {
    requestedPage.current = next;
    onPageChange(next);
  }

  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Previous</button>
      <span>Page {page} / {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => goToPage(page + 1)}>Next →</button>
    </div>
  );
}
