'use client';

import {useId, useRef} from 'react';
import {Star} from 'lucide-react';

type StarRatingProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  allowNotApplicable?: boolean;
};

export function StarRating({label, value, onChange, required = false, allowNotApplicable = false}: StarRatingProps) {
  const name = useId();
  const firstStar = useRef<HTMLInputElement>(null);

  function clear() {
    onChange('');
    firstStar.current?.focus();
  }

  return <fieldset className="review-star-rating">
    <legend>{label}</legend>
    <div className="review-star-row">
      <div className="review-stars">
        {[1, 2, 3, 4, 5].map(score => <label className="review-star" key={score}>
          <input type="radio" name={name} value={score} checked={value === String(score)}
            ref={score === 1 ? firstStar : undefined} required={required}
            aria-label={score === 1 ? '1 star' : `${score} stars`}
            onChange={event => onChange(event.target.value)} />
          <Star aria-hidden="true" className={score <= Number(value) ? 'is-filled' : undefined} />
        </label>)}
      </div>
      {!required && <button type="button" className="review-star-clear" disabled={!value} onClick={clear}>Clear</button>}
    </div>
    {allowNotApplicable && <label className="review-star-na">
      <input type="radio" name={name} value="na" checked={value === 'na'} onChange={event => onChange(event.target.value)} />
      Not applicable
    </label>}
  </fieldset>;
}
