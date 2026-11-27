import { Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { CreateLabPage } from '../features/lab-authoring/CreateLabPage';
import { TaLabsPage } from '../features/lab-authoring/TaLabsPage';
import { StudentLabPage, StudentLabsPage } from '../features/lab-view/StudentLabPage';
import { ReviewQueuePage } from '../features/review-queue/ReviewQueuePage';
import { SubmitJudgePage } from '../features/submit-judge/SubmitJudgePage';
import { StudentLayout, TaLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';
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
      // Old TA home; kept so bookmarks and links still work.
      { path: 'classes', element: <Navigate to="/ta/labs" replace /> },
      { path: 'review-queue', element: <ReviewQueuePage /> },
      { path: 'labs', element: <TaLabsPage /> },
      { path: 'classes/:classId/labs/new', element: <CreateLabPage /> },
      { path: 'labs/:labId/review', element: <ReviewQueuePage /> },
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
      { path: 'labs', element: <StudentLabsPage /> },
      { path: 'labs/:labId', element: <StudentLabPage /> },
      { path: 'submit', element: <SubmitJudgePage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
