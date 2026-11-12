import type { RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { ClassesGradingPage } from '../features/classes-grading/ClassesGradingPage';
import { ReviewQueuePage } from '../features/review-queue/ReviewQueuePage';
import { SubmitJudgePage } from '../features/submit-judge/SubmitJudgePage';
import { StudentLayout, TaLayout } from './AppLayout';
import { EmptyState } from './EmptyState';
import { HomeRedirect, RequireRole } from './RequireRole';

export const routes: RouteObject[] = [
  { path: '/', element: <HomeRedirect /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/ta',
    element: (
      <RequireRole role="ta">
        <TaLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'classes', element: <ClassesGradingPage /> },
      { path: 'review-queue', element: <ReviewQueuePage /> },
    ],
  },
  {
    path: '/student',
    element: (
      <RequireRole role="student">
        <StudentLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'submit', element: <SubmitJudgePage /> },
    ],
  },
  {
    path: '*',
    element: (
      <main className="lk-page lk-page--narrow">
        <EmptyState title="Không tìm thấy trang">Đường dẫn này không tồn tại.</EmptyState>
      </main>
    ),
  },
];
