-- migrate-5.sql — 영수증 한 건에 사진 여러 장
--
-- 손으로 쓴 명세가 2~3장이고 카드 전표가 따로 붙는 경우가 있다.
-- 그때 사진 한 장만 남기면 증빙이 반쪽이 된다.
--
-- image_path 는 그대로 둔다 (대표 = 정산에 쓰는 사진).
-- 나머지 장은 extra_paths 에 순서대로 들어간다.
-- 같은 표의 칼럼이라 RLS 정책을 새로 만들 필요가 없다 — 영수증을 볼 수 있는
-- 사람이면 사진 목록도 볼 수 있고, 아니면 못 본다. 그게 이미 맞는 규칙이다.

alter table receipts
  add column if not exists extra_paths text[] not null default '{}';

comment on column receipts.image_path is
  '대표 사진. AI가 읽고, 목록·PDF에 나오는 것도 이 장이다.';
comment on column receipts.extra_paths is
  '같은 거래의 나머지 증빙 사진. 보이는 순서대로.';
