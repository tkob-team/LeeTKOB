import type { JudgeCode } from '../../components/ui';

/**
 * Vietnamese caption for a judge code, shown next to the code (the code itself stays as the
 * design system writes it). TLE names the lab's CPU limit when it is known.
 */
export function verdictCaption(code: Exclude<JudgeCode, 'pending'>, cpuTimeMs?: number): string {
  switch (code) {
    case 'AC':
      return 'Đúng tất cả test';
    case 'WA':
      return 'Sai kết quả ở ít nhất một test';
    case 'TLE':
      return cpuTimeMs === undefined
        ? 'Quá giới hạn thời gian CPU'
        : `Quá giới hạn thời gian CPU (${String(cpuTimeMs)} ms)`;
    case 'MLE':
      return 'Vượt giới hạn bộ nhớ';
    case 'RE':
      return 'Lỗi khi chạy (chương trình dừng bất thường)';
    case 'CE':
      return 'Lỗi biên dịch';
  }
}
