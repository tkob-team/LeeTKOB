export interface NotFoundPageProps {
  /** Heading; a page that knows what is missing names it ("Không tìm thấy lớp"). */
  title?: string;
  /** The sentence under the heading. */
  detail?: string;
}

/** A class page whose class does not exist or is not the viewer's (404, or a non-UUID id). */
export const CLASS_NOT_FOUND = {
  title: 'Không tìm thấy lớp',
  detail: 'Lớp không tồn tại hoặc bạn không thuộc lớp này.',
} as const satisfies NotFoundPageProps;
