/**
 * Ce que lit `get_direction_overview` : les cases de la vue d'ensemble, les annonces et les événements de la Direction.
 * Partagé par `DirectionApp.tsx`, `DirectionEnsemble.tsx`, `DirectionAnnonces.tsx` et `DirectionEvenements.tsx`.
 */
export interface NewsRow {
  id: number;
  title: string;
  url: string | null;
  author: string | null;
  editable: boolean;
}
export interface AnnouncementRow extends NewsRow {
  body: string;
  created_at: string;
}
export interface EventRow extends NewsRow {
  description: string | null;
  starts_at: string;
}
export interface Overview {
  pending_requests: number;
  members: number;
  officers: number;
  suspended: number;
  roster: { total: number; read_at: string } | null;
  announcements: AnnouncementRow[];
  events: EventRow[];
}
