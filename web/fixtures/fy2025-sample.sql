-- Fixture: FY2025 federal operating expenditure, votes T.01–T.07.
-- All amounts are integer sen. Source: JANM Penyata Kewangan Kerajaan Persekutuan 2025,
-- Lampiran 1, book pages 91–92 (PDF pages 105–106).
-- Numbers copied exactly from the printed statement; virements satisfy the check
-- original_sen + supplementary_sen + virement_sen = revised_sen for every leaf row.

begin;

insert into source_document (id, publisher, title, fiscal_year, url, sha256, page_count, retrieved_at)
values (
  'janm-pkkp-2025',
  'Jabatan Akauntan Negara Malaysia',
  'Penyata Kewangan Kerajaan Persekutuan 2025',
  2025,
  'https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf',
  '5dd1673c6c42420be1b1f70cd68881358e21768e82850e864c26f2421b24a515',
  458,
  '2025-12-31 00:00:00+00'
)
on conflict (id) do nothing;

-- ── Votes ────────────────────────────────────────────────────────────────────

insert into vote (fiscal_year, code, name_ms, section) values
  (2025, 'T.01', 'Peruntukan Diraja Bagi S.P.B. Yang Di-Pertuan Agong', 'charged'),
  (2025, 'T.02', 'Elaun-elaun Diraja',                                   'charged'),
  (2025, 'T.03', 'Ketua Hakim Negara, Hakim Besar Dan Hakim',            'charged'),
  (2025, 'T.04', 'Ketua Audit Negara',                                   'charged'),
  (2025, 'T.05', 'Yang Di-Pertua Dewan Rakyat',                          'charged'),
  (2025, 'T.06', 'Yang Di-Pertua Dewan Negara',                          'charged'),
  (2025, 'T.07', 'Suruhanjaya Pilihan Raya',                             'charged')
on conflict (fiscal_year, code) do nothing;

-- ── Programmes ───────────────────────────────────────────────────────────────

insert into programme (fiscal_year, vote_code, code, name_ms) values
  (2025, 'T.01', '010000', 'Pentadbiran Am'),
  (2025, 'T.02', '010000', 'Elaun-elaun Diraja'),
  (2025, 'T.03', '010000', 'Mahkamah Persekutuan'),
  (2025, 'T.03', '020000', 'Mahkamah Rayuan'),
  (2025, 'T.03', '030000', 'Mahkamah Tinggi'),
  (2025, 'T.04', '010000', 'Pentadbiran Korporat'),
  (2025, 'T.05', '010000', 'Urusan Parlimen'),
  (2025, 'T.06', '010000', 'Urusan Parlimen'),
  (2025, 'T.07', '010000', 'Pilihan Raya')
on conflict (fiscal_year, vote_code, code) do nothing;

-- ── Activities ───────────────────────────────────────────────────────────────

insert into activity (fiscal_year, vote_code, code, programme_code, name_ms) values
  (2025, 'T.01', '010100', '010000', 'Pentadbiran Am'),
  (2025, 'T.02', '010100', '010000', 'Elaun-elaun Diraja'),
  (2025, 'T.03', '010100', '010000', 'Mahkamah Persekutuan'),
  (2025, 'T.03', '020100', '020000', 'Mahkamah Rayuan'),
  (2025, 'T.03', '030100', '030000', 'Mahkamah Tinggi'),
  (2025, 'T.04', '010100', '010000', 'Pentadbiran Korporat'),
  (2025, 'T.05', '010100', '010000', 'Urusan Parlimen'),
  (2025, 'T.06', '010100', '010000', 'Urusan Parlimen'),
  (2025, 'T.07', '010100', '010000', 'Pengurusan'),
  (2025, 'T.07', '010200', '010000', 'Operasi')
on conflict (fiscal_year, vote_code, code) do nothing;

-- ── Operating lines (leaf facts, amounts in integer sen) ─────────────────────
-- Columns: fiscal_year, vote_code, activity_code, object_code,
--          original_sen, supplementary_sen, virement_sen, revised_sen, actual_sen,
--          document_id, pdf_page, book_page, source_text

insert into operating_line
  (fiscal_year, vote_code, activity_code, object_code,
   original_sen, supplementary_sen, virement_sen, revised_sen, actual_sen,
   document_id, pdf_page, book_page, source_text)
values
  -- T.01 / 010100 Pentadbiran Am (book p.91, PDF p.105)
  (2025,'T.01','010100','10000',  760200000,0,         0,  760200000, 760198615,'janm-pkkp-2025',105,91,' 10000 Emolumen                                   7,602,000           –                –        7,602,000    7,601,986.15'),
  (2025,'T.01','010100','20000',  561100000,0, -12150000,  548950000, 548943046,'janm-pkkp-2025',105,91,' 20000 Perkhidmatan dan Bekalan                   5,611,000           –           (121,500)     5,489,500    5,489,430.46'),
  (2025,'T.01','010100','30000',   17000000,0,  15760000,   32760000,  32754100,'janm-pkkp-2025',105,91,' 30000 Aset                                         170,000           –            157,600        327,600      327,541.00'),
  (2025,'T.01','010100','40000',   15000000,0,  -3610000,   11390000,  11381479,'janm-pkkp-2025',105,91,' 40000 Pemberian dan Kenaan Bayaran Tetap           150,000           –             (36,100)      113,900      113,814.79'),

  -- T.02 / 010100 Elaun-elaun Diraja (book p.91, PDF p.105)
  (2025,'T.02','010100','10000',  133700000,0,         0,  133700000, 133124957,'janm-pkkp-2025',105,91,' 10000 Emolumen                                   1,337,000           –                –        1,337,000    1,331,249.57'),

  -- T.03 / 010100 Mahkamah Persekutuan (book p.91, PDF p.105)
  (2025,'T.03','010100','10000',  930000000,0,         0,  930000000, 912706156,'janm-pkkp-2025',105,91,' 10000 Emolumen                                   9,300,000           –                –        9,300,000    9,127,061.56'),
  (2025,'T.03','010100','20000',  653000000,0,         0,  653000000, 448762013,'janm-pkkp-2025',105,91,' 20000 Perkhidmatan dan Bekalan                   6,530,000           –                –        6,530,000    4,487,620.13'),
  (2025,'T.03','010100','30000',   70000000,0,         0,   70000000,  65313100,'janm-pkkp-2025',105,91,' 30000 Aset                                         700,000           –                –          700,000      653,131.00'),
  (2025,'T.03','010100','40000',   18000000,0,         0,   18000000,   4034808,'janm-pkkp-2025',105,91,' 40000 Pemberian dan Kenaan Bayaran Tetap           180,000           –                –          180,000       40,348.08'),

  -- T.03 / 020100 Mahkamah Rayuan (book p.91, PDF p.105)
  (2025,'T.03','020100','10000', 1660000000,0, 319500000, 1979500000,1979453772,'janm-pkkp-2025',105,91,' 10000 Emolumen                                  16,600,000           –          3,195,000     19,795,000   19,794,537.72'),
  (2025,'T.03','020100','20000',  241000000,0, -65700000,  175300000, 175190555,'janm-pkkp-2025',105,91,' 20000 Perkhidmatan dan Bekalan                   2,410,000           –           (657,000)     1,753,000    1,751,905.55'),
  (2025,'T.03','020100','30000',   50000000,0, -23450000,   26550000,  26545250,'janm-pkkp-2025',105,91,' 30000 Aset                                         500,000           –           (234,500)       265,500      265,452.50'),
  (2025,'T.03','020100','40000',    5000000,0,   -600000,    4400000,   4392696,'janm-pkkp-2025',105,91,' 40000 Pemberian dan Kenaan Bayaran Tetap            50,000           –              (6,000)       44,000       43,926.96'),

  -- T.03 / 030100 Mahkamah Tinggi (book p.91, PDF p.105)
  (2025,'T.03','030100','10000', 6322000000,0,-229750000, 6092250000,5967589546,'janm-pkkp-2025',105,91,' 10000 Emolumen                                  63,220,000           –          (2,297,500)   60,922,500   59,675,895.46'),
  (2025,'T.03','030100','20000', 1946000000,0,         0, 1946000000,1815531291,'janm-pkkp-2025',105,91,' 20000 Perkhidmatan dan Bekalan                  19,460,000           –                –       19,460,000   18,155,312.91'),
  (2025,'T.03','030100','30000',   75000000,0,         0,   75000000,  68658480,'janm-pkkp-2025',105,91,' 30000 Aset                                         750,000           –                –          750,000      686,584.80'),
  (2025,'T.03','030100','40000',   30000000,0,         0,   30000000,   9881413,'janm-pkkp-2025',105,91,' 40000 Pemberian dan Kenaan Bayaran Tetap           300,000           –                –          300,000       98,814.13'),

  -- T.04 / 010100 Pentadbiran Korporat (book p.92, PDF p.106)
  (2025,'T.04','010100','10000',   49870000,0,   4400000,   54270000,  54255246,'janm-pkkp-2025',106,92,' 10000 Emolumen                                     498,700            –                44,000       542,700       542,552.46'),
  (2025,'T.04','010100','20000',   40170000,0,  -4400000,   35770000,  34085015,'janm-pkkp-2025',106,92,' 20000 Perkhidmatan dan Bekalan                     401,700            –               (44,000)      357,700       340,850.15'),

  -- T.05 / 010100 Urusan Parlimen (book p.92, PDF p.106)
  (2025,'T.05','010100','10000',   56400000,0,         0,   56400000,  56400000,'janm-pkkp-2025',106,92,' 10000 Emolumen                                     564,000            –                  –          564,000       564,000.00'),

  -- T.06 / 010100 Urusan Parlimen (book p.92, PDF p.106)
  (2025,'T.06','010100','10000',   50400000,0,         0,   50400000,  50400000,'janm-pkkp-2025',106,92,' 10000 Emolumen                                     504,000            –                  –          504,000       504,000.00'),

  -- T.07 / 010100 Pengurusan (book p.92, PDF p.106)
  (2025,'T.07','010100','10000',   78420000,0,         0,   78420000,  75093818,'janm-pkkp-2025',106,92,' 10000 Emolumen                                     784,200            –                  –          784,200       750,938.18'),

  -- T.07 / 010200 Operasi (book p.92, PDF p.106)
  (2025,'T.07','010200','10000',  150350000,0,         0,  150350000, 142336560,'janm-pkkp-2025',106,92,' 10000 Emolumen                                    1,503,500           –                  –         1,503,500     1,423,365.60'),
  (2025,'T.07','010200','20000',   29550000,0,         0,   29550000,  18430362,'janm-pkkp-2025',106,92,' 20000 Perkhidmatan dan Bekalan                      295,500           –                  –           295,500       184,303.62')

on conflict (fiscal_year, vote_code, activity_code, object_code) do nothing;

-- ── Printed totals ───────────────────────────────────────────────────────────
-- Scope 'activity': sums the leaf lines for one activity (all object groups).
-- Scope 'programme': sums all activities within a programme.
-- Scope 'vote': sums all programmes within a vote.
-- object_code is null for all three scopes (whole-activity / whole-programme / whole-vote).

insert into printed_total
  (document_id, fiscal_year, scope, section, vote_code, programme_code, activity_code, object_code,
   original_sen, supplementary_sen, virement_sen, revised_sen, actual_sen,
   pdf_page, book_page, source_text)
values
  -- ── T.01 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.01','010000','010100',NULL,
   1353300000,0,0,1353300000,1353277240, 105,91,'Jumlah 010100  13,533,000  –  –  13,533,000  13,532,772.40'),
  ('janm-pkkp-2025',2025,'programme','charged','T.01','010000',NULL,NULL,
   1353300000,0,0,1353300000,1353277240, 105,91,'Jumlah 010000  13,533,000  –  –  13,533,000  13,532,772.40'),
  ('janm-pkkp-2025',2025,'vote','charged','T.01',NULL,NULL,NULL,
   1353300000,0,0,1353300000,1353277240, 105,91,'JUMLAH PERUNTUKAN DIRAJA BAGI S.P.B. YANG DI-PERTUAN AGONG  13,533,000  –  –  13,533,000  13,532,772.40'),

  -- ── T.02 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.02','010000','010100',NULL,
   133700000,0,0,133700000,133124957, 105,91,'Jumlah 010100  1,337,000  –  –  1,337,000  1,331,249.57'),
  ('janm-pkkp-2025',2025,'programme','charged','T.02','010000',NULL,NULL,
   133700000,0,0,133700000,133124957, 105,91,'Jumlah 010000  1,337,000  –  –  1,337,000  1,331,249.57'),
  ('janm-pkkp-2025',2025,'vote','charged','T.02',NULL,NULL,NULL,
   133700000,0,0,133700000,133124957, 105,91,'JUMLAH ELAUN-ELAUN DIRAJA  1,337,000  –  –  1,337,000  1,331,249.57'),

  -- ── T.03 programme 010000 ─────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.03','010000','010100',NULL,
   1671000000,0,0,1671000000,1430816077, 105,91,'Jumlah 010100  16,710,000  –  –  16,710,000  14,308,160.77'),
  ('janm-pkkp-2025',2025,'programme','charged','T.03','010000',NULL,NULL,
   1671000000,0,0,1671000000,1430816077, 105,91,'Jumlah 010000  16,710,000  –  –  16,710,000  14,308,160.77'),

  -- ── T.03 programme 020000 ─────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.03','020000','020100',NULL,
   1956000000,0,229750000,2185750000,2185582273, 105,91,'Jumlah 020100  19,560,000  –  2,297,500  21,857,500  21,855,822.73'),
  ('janm-pkkp-2025',2025,'programme','charged','T.03','020000',NULL,NULL,
   1956000000,0,229750000,2185750000,2185582273, 105,91,'Jumlah 020000  19,560,000  –  2,297,500  21,857,500  21,855,822.73'),

  -- ── T.03 programme 030000 ─────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.03','030000','030100',NULL,
   8373000000,0,-229750000,8143250000,7861660730, 105,91,'Jumlah 030100  83,730,000  –  (2,297,500)  81,432,500  78,616,607.30'),
  ('janm-pkkp-2025',2025,'programme','charged','T.03','030000',NULL,NULL,
   8373000000,0,-229750000,8143250000,7861660730, 106,92,'Jumlah 030000  83,730,000  –  (2,297,500)  81,432,500  78,616,607.30'),

  -- ── T.03 vote ─────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'vote','charged','T.03',NULL,NULL,NULL,
   12000000000,0,0,12000000000,11478059080, 106,92,'JUMLAH KETUA HAKIM NEGARA, HAKIM BESAR DAN HAKIM  120,000,000  –  –  120,000,000  114,780,590.80'),

  -- ── T.04 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.04','010000','010100',NULL,
   90040000,0,0,90040000,88340261, 106,92,'Jumlah 010100  900,400  –  –  900,400  883,402.61'),
  ('janm-pkkp-2025',2025,'programme','charged','T.04','010000',NULL,NULL,
   90040000,0,0,90040000,88340261, 106,92,'Jumlah 010000  900,400  –  –  900,400  883,402.61'),
  ('janm-pkkp-2025',2025,'vote','charged','T.04',NULL,NULL,NULL,
   90040000,0,0,90040000,88340261, 106,92,'JUMLAH KETUA AUDIT NEGARA  900,400  –  –  900,400  883,402.61'),

  -- ── T.05 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.05','010000','010100',NULL,
   56400000,0,0,56400000,56400000, 106,92,'Jumlah 010100  564,000  –  –  564,000  564,000.00'),
  ('janm-pkkp-2025',2025,'programme','charged','T.05','010000',NULL,NULL,
   56400000,0,0,56400000,56400000, 106,92,'Jumlah 010000  564,000  –  –  564,000  564,000.00'),
  ('janm-pkkp-2025',2025,'vote','charged','T.05',NULL,NULL,NULL,
   56400000,0,0,56400000,56400000, 106,92,'JUMLAH YANG DI-PERTUA DEWAN RAKYAT  564,000  –  –  564,000  564,000.00'),

  -- ── T.06 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.06','010000','010100',NULL,
   50400000,0,0,50400000,50400000, 106,92,'Jumlah 010100  504,000  –  –  504,000  504,000.00'),
  ('janm-pkkp-2025',2025,'programme','charged','T.06','010000',NULL,NULL,
   50400000,0,0,50400000,50400000, 106,92,'Jumlah 010000  504,000  –  –  504,000  504,000.00'),
  ('janm-pkkp-2025',2025,'vote','charged','T.06',NULL,NULL,NULL,
   50400000,0,0,50400000,50400000, 106,92,'JUMLAH YANG DI-PERTUA DEWAN NEGARA  504,000  –  –  504,000  504,000.00'),

  -- ── T.07 ──────────────────────────────────────────────────────────────────
  ('janm-pkkp-2025',2025,'activity','charged','T.07','010000','010100',NULL,
   78420000,0,0,78420000,75093818, 106,92,'Jumlah 010100  784,200  –  –  784,200  750,938.18'),
  ('janm-pkkp-2025',2025,'activity','charged','T.07','010000','010200',NULL,
   179900000,0,0,179900000,160766922, 106,92,'Jumlah 010200  1,799,000  –  –  1,799,000  1,607,669.22'),
  ('janm-pkkp-2025',2025,'programme','charged','T.07','010000',NULL,NULL,
   258320000,0,0,258320000,235860740, 106,92,'Jumlah 010000  2,583,200  –  –  2,583,200  2,358,607.40'),
  ('janm-pkkp-2025',2025,'vote','charged','T.07',NULL,NULL,NULL,
   258320000,0,0,258320000,235860740, 106,92,'JUMLAH SURUHANJAYA PILIHAN RAYA  2,583,200  –  –  2,583,200  2,358,607.40');

commit;
