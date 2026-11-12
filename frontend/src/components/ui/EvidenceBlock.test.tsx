import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceBlock } from './EvidenceBlock';

describe('EvidenceBlock', () => {
  it('numbers lines from firstLine and highlights only evidence lines', () => {
    render(
      <EvidenceBlock
        label="Bài nộp s05, dòng bằng chứng 8"
        firstLine={7}
        evidence={[8]}
        lines={['void mergeSort() {', '    stable_sort(a.begin(), a.end());', '}']}
      />,
    );
    const region = screen.getByRole('region', { name: 'Bài nộp s05, dòng bằng chứng 8' });
    expect(region).toHaveClass('lk-evidence');
    const rows = region.querySelectorAll('.lk-line');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector('.lk-ln')).toHaveTextContent('7');
    expect(rows[1]).toHaveClass('lk-line--hit');
    expect(rows[1]).toHaveTextContent('stable_sort(a.begin(), a.end());');
    expect(region.querySelectorAll('.lk-line--hit')).toHaveLength(1);
  });
});
