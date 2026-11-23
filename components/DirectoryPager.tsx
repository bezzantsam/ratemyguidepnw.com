'use client';

import {useLayoutEffect, useRef, type RefObject} from 'react';

type DirectoryPagerProps = {
  page: number;
  pages: number;
  resultsRef: RefObject<HTMLDivElement | null>;
  onPageChange: (page: number) => void;
};

export default function DirectoryPager({page, pages, resultsRef, onPageChange}: DirectoryPagerProps) {
  const requestedPage = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (requestedPage.current !== page) return;
    requestedPage.current = null;
    const heading = resultsRef.current;
    heading?.focus({preventScroll: true});
    heading?.scrollIntoView({block: 'start'});
  }, [page, resultsRef]);

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
