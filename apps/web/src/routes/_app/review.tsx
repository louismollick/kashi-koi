import { createFileRoute } from '@tanstack/react-router';
import { ReviewScreen } from '@/components/ReviewScreen';

export const Route = createFileRoute('/_app/review')({ component: ReviewScreen });
