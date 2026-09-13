```
7행 : 기상청 API허브
636행 : Open-Meteo
1002행 : Copernicus Sentinel-2
```

# DOMAIN_REF — 기상청 API허브

> 세이프팜이 쓰는 기상 데이터 원천.
> 다른 출처(Open-Meteo, Sentinel Hub)는 별도 문서.

- data/stations.csv : 국내 기상청 관측지점정보
- data/warn_regions.csv : 기상특보구역 코드표. kind=land 만 사용
---

## 0. 시작하기

### 인증키

`.env`로 분리. 코드에 박지 말 것. `.gitignore` 필수.

```
# .env
KMA_API_KEY=발급키
```

### URL은 사이트에서 복사한 것을 씁니다

경로가 두 종류라 손으로 조립하면 틀립니다. **각 엔드포인트 페이지의 "생성 URL"을 그대로 복사**하고 파라미터만 바꾸세요.

```
일반형   /api/typ01/url/{name}.php
CGI형    /api/typ01/cgi-bin/url/nph-{name}      ← nph- 로 시작하면 이쪽
```

### 응답 포맷 `disp`

```
0  등간격 텍스트   ← 눈으로 확인할 때 (기상청 예시 기본값)
1  CSV
2  JSON           ← 코드로 파싱할 때
3  XML
```

**엔드포인트마다 지원 범위가 다릅니다.** 일부는 등간격·CSV만 있습니다.
생성 URL에 `disp`가 없으면 직접 붙이세요.

---

## 1. 엔드포인트 7종 — 생성 URL

인증키 부분만 바꿔 쓰면 됩니다.

### ① 지상관측 일통계 — 적산온도 계산 `필수`

```
https://apihub.kma.go.kr/api/typ01/url/arcltr_sfc_day.php
  ?authKey={KEY}&stn=137&tm1=20260401&tm2=20260913&disp=2
```

### ② 지상관측 평년값 — 평년 대비 판정 `필수`

```
https://apihub.kma.go.kr/api/typ01/url/arcltr_sfc_norm.php
  ?authKey={KEY}&stn=137&norm=D&tmst=2021&MM1=1&DD1=1&MM2=12&DD2=31&disp=2
```

### ③ 절기별 작물재해 — 24절기 + 5개 재해 `필수`

```
https://apihub.kma.go.kr/api/typ01/url/arcltr_solar_term_crop.php
  ?authKey={KEY}&stn=137&risk=01&solar_term=01&YY1=2021&YY2=2025&disp=2
```

### ④ 천리안2A 기상산출물 — 지표면온도·강우강도 `2차`

```
https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sat_txt
  ?authKey={KEY}&tm1=202609130000&tm2=202609130030&int=30
  &lat=36.4084&lon=128.1574&varn=LST
```

### ⑤ 수치모델 — 지중온도·토양수분 `2차`

```
https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_nwp_txt
  ?authKey={KEY}&nwp=KIMG&varn=SOILTMP_0.1M
  &tm=202609130000&tmef1=202609130000&tmef2=202609130600&int=3
  &lat=36.4084&lon=128.1574
```

### ⑥ 천리안2A AI 일사량 — 광합성·곶감 건조 `3차`

```
https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sat_ana_txt
  ?authKey={KEY}&tm1=202609130000&tm2=202609130030&int=30
  &lat=36.4084&lon=128.1574
```

### ⑦ 관측-통계 묶음형 — 호출 수 절감 `편의`

```
https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sfc_sts_pkg
  ?authKey={KEY}&stn=137&mode=ss&tm1=202609130000&tm2=202609130100
```

---

## 2. ⚠ 조회 키가 네 종류입니다

이 API에서 가장 헷갈리는 부분입니다. 엔드포인트마다 **무엇으로 지점을 지정하는지**가 다릅니다.

| 조회 키 | 엔드포인트 | 변환 방법 |
|---|---|---|
| `stn` 관측소 | 일통계 · 평년값 · 절기재해 · 묶음형 | 좌표에서 최근접 계산 |
| `lat` `lon` 좌표 | 천리안 산출물 · 수치모델 · 일사량 | 그대로 사용 |
| `nx` `ny` 예보격자 | 동네예보 (단기·초단기) | **API가 변환** (`nph-dfs_xy_lonlat`) |
| `REG_ID` 특보구역 | 특보현황 · 기상정보 | **코드표에서 행정구역명 매칭** |

```
stn=137            상주 관측소 한 점
lat/lon            밭 좌표 그대로
nx=.. ny=..        5km 격자
REG_ID=L1071200    상주시 (행정구역 기반)
```

**천리안·수치모델은 밭 좌표로 조회됩니다.** 좌표를 넣으면 그 지점 격자값이 나옵니다.

상주 3지점 실측에서 해발 84m 차이가 하루 0.6℃로 갈린 것을 확인했으므로, **좌표 조회가 가능한 것은 좌표로 부르는 게 맞습니다.**

### 텃밭 등록 시 한 번에 해둘 것

```
사용자가 지도에 핀 찍음 → 위경도 확보
  ① 최근접 관측소     stations.csv 에서 거리 계산    → plots.station
  ② 예보격자          nph-dfs_xy_lonlat 호출         → plots.nx, plots.ny
  ③ 특보구역          역지오코딩 + warn_regions.csv  → plots.warn_region
```

**셋 다 텃밭 위치가 바뀌지 않는 한 재계산 불필요.**

### 관측소 번호

| 지점 | stn | 위도 | 경도 |
|---|---|---|---|
| 상주 | **137** | 36.40837 | 128.15741 |
| 서울 | 108 | — | — |

`stn=0` 이면 전체 지점. 지역 추가 시 여기에 append.

---

## 3. 엔드포인트 상세

### ① 지상관측 일통계 `arcltr_sfc_day.php`

**적산온도 계산의 뼈대.** 실측이라 과거 날짜를 거슬러 계산할 수 있음.

```
stn   지점번호          137
tm1   시작일 yyyymmdd   20260401
tm2   종료일 yyyymmdd   20260913
disp  2
```

| 필드 | 뜻 | 단위 | 우리 컬럼 |
|---|---|---|---|
| `TM` | 일자 yyyymmdd | | `date` |
| `TA_MAX` | **일 최고기온** | ℃ | `tmax` |
| `TA_MIN` | **일 최저기온** | ℃ | `tmin` |
| `TA_DAY` | 일 평균기온 | ℃ | `tmean` |
| `RN_DAY` | 일 강수량 | mm | `rain` |
| `RN_1HR_MAX` | 1시간 최다강수 | mm | |
| `WS_DAY` | 일 평균풍속 | m/s | |
| `WS_MAX` | 최대풍속 | m/s | `wind_max` |
| `WS_MAX_TM` | 최대풍속 시각 HHMM | | |
| `RE_DAY` | 관측 분수 | 분 | 결측 판단 |

```json
{ "result":"ok",
  "data":[{ "TM":"20260913", "STN_ID":137, "STN_KO":"상주",
             "TA_DAY":-999, "TA_MAX":28.8, "TA_MIN":15.0,
             "RN_DAY":0, "WS_DAY":-999, "WS_MAX":2.7 }] }
```

**수집 실적** 상주 137 · 2026-04-01~09-13 · 166일 · 결측 없음

---

### ② 지상관측 평년값 `arcltr_sfc_norm.php`

한 번 받아 `data/ref/normals.csv`로 고정.

```
stn    137
norm   D(일) / S(순) / M(월) / Y(년)
tmst   평년기간 코드
MM1    시작 월 · DD1 시작 일
MM2    종료 월 · DD2 종료 일
```

| `tmst` | 기간 |
|---|---|
| 1991 | 1961~1990 |
| 2001 | 1971~2000 |
| 2011 | 1981~2010 |
| **2021** | **1991~2020** ← 현행 |

`norm=S`(순) 조회 시 `DD1`에 100(상순) / 200(중순) / 300(하순).

**제공 항목** 기온 · 강수 · 습도 · 구름 · 증발 · 일사 · 풍속

**상태** 미호출. 1순위 작업.

---

### ③ 절기별 작물재해 `arcltr_solar_term_crop.php`

**24절기 날짜를 자동 계산해줍니다.** 절기표를 따로 만들 필요 없음.

```
stn          137
risk         재해분류 01~05
solar_term   절기번호 01~24
mmdd         일자 직접 지정 (solar_term과 함께 오면 solar_term 우선)
YY1 / YY2    연도 범위
help         1이면 필드 설명 포함
```

| `risk` | 재해 | 주 사용처 |
|---|---|---|
| 01 | 저온재해 | 서리·냉해 — 전 탭 |
| 02 | 고온재해 | 결구기 고온, 등숙 장해 |
| 03 | 일소재해 | **과수 탭** |
| 04 | 바람재해 | 낙과·도복·방제 불가 |
| 05 | 홍수가뭄재해 | 관수 판단 |

```
01 입춘  02 우수  03 경칩  04 춘분  05 청명  06 곡우
07 입하  08 소만  09 망종  10 하지  11 소서  12 대서
13 입추  14 처서  15 백로  16 추분  17 한로  18 상강
19 입동  20 소설  21 대설  22 동지  23 소한  24 대한
```

**응답 필드 (risk=01 확인분)**

| 필드 | 뜻 |
|---|---|
| `TM` | 일자. 절기 해당일 — **해마다 다름** |
| `TA_MIN` | 일 최저기온 |
| `TA` | 일 평균기온 |
| **`TG_MIN`** | **최저초상온도** — 풀 높이 |

> `risk`가 바뀌면 필드도 바뀝니다. **02~05는 아직 미확인.** 각각 한 번씩 호출 필요.

**`TG_MIN`이 이 API를 쓰는 이유**

```
TA_MIN   지면 1.5m 공기 온도   ← 일반 일기예보가 보여주는 값
TG_MIN   풀 끝 높이 온도        ← 서리가 실제로 맺히는 높이
```

상주 2024-02-04 실측: **기온 +1.7℃ / 초상 -1.5℃**
예보상 영상이지만 실제로는 서리. 과수 개화기 경보의 근거.

**활용** 여러 해를 뽑아 평균 내면 절기별 평년 기준값이 됩니다.
```
입춘 초상온도 5년: -10.4, -8.4, -11.0, -1.5, -7.6  →  평균 -7.8℃
```
24절기 × 5개 재해 = 120개 조합의 기준을 임계값 조사 없이 확보.

---

### ④ 천리안2A 기상산출물 `nph-arcltr_sat_txt` `CGI형`

```
tm1, tm2   yyyymmddHHMM (UTC) · 30분 간격
int        자료간격(분) · 30
lat, lon   좌표
area       행정구역 코드 (lat/lon과 택1)
varn       자료종류
```

| `varn` | 뜻 | 용도 |
|---|---|---|
| **`LST`** | **지표면온도** | 서리 경보 정밀화 |
| `RR` | 강우강도 | 호우 판정 |
| `CA` | 지상운량 | 위성 결측 예측 |
| `ASR` | 지면 흡수단파복사 | 광합성 추정 |

**왜 LST인가.** 기상청 기온은 공기 온도인데 서리는 **땅 표면**에서 맺힙니다. 맑은 밤엔 지표가 공기보다 2~3도 더 떨어집니다.

```
기온 3℃    → "서리 안 오겠네"
지표면 0℃  → 실제로 서리
```

**⚠ `tm1`/`tm2`가 UTC입니다.** 한국시각 −9시간. 다른 엔드포인트는 KST라 섞으면 9시간 어긋납니다.

---

### ⑤ 수치모델 `nph-arcltr_nwp_txt` `CGI형`

```
nwp        모델 · KIMG(전구) / KIMR(지역) / KIML(국지)
tm         발표시각 yyyymmddHHMM (UTC) · 6시간 간격
tmef1/2    예측시각 범위
int        자료간격(시간) · 3
lat, lon   좌표
varn       자료종류
```

| `varn` | 뜻 | 용도 |
|---|---|---|
| `SOILTMP_0.1M` | **지중온도 0~0.1m** | 파종 가능 판정 |
| `SOILTMP_0.4M` / `1M` / `2M` | 깊이별 지중온도 | 과수 뿌리층 |
| `SOILW_*` | **토양수분** 깊이별 | 관수 판단 |
| 최고기온 / 최저기온 | | 예보 검증 |
| 지면온도 · 돌풍 · 상대습도 | | |

**지온이 파종 판정에 쓰입니다.** 농진청 직파 문서는 기온 기준(13~15℃)이지만, 감자처럼 지온이 더 중요한 작물이 있습니다.

**주의** `tm`은 발표시각, `tmef`는 예측시각. 둘을 혼동하면 엉뚱한 값이 나옵니다.

---

### ⑥ 천리안2A AI 일사량 `nph-arcltr_sat_ana_txt` `CGI형`

```
tm1, tm2   yyyymmddHHMM (UTC) · 30분 간격
int        30
lat, lon   좌표
area       행정구역 코드
```

광합성량 추정, **곶감 건조 조건** 판정.
단감 문서의 재배 적지 조건에 "일조시간 2,340시간 이상"이 있습니다.

---

### ⑦ 관측-통계 묶음형 `nph-arcltr_sfc_sts_pkg` `CGI형`

```
stn        137
mode       ss(일조시간) / si(일사량) / rf(강수량) / ta(기온)
tm1, tm2   yyyymmddHHMM (KST)
```

여러 항목을 한 번에. 호출 수를 줄일 때만.

---

## 4. 예특보 카테고리

### 4-1. 쓸 것 — 특보

| # | 이름 | 엔드포인트 | 용도 |
|---|---|---|---|
| 2 | **특보현황 조회** | `wrn_now_data_new.php` | **지금 발효 중인 특보** |
| 1.1 | 특보구역 코드표 | `wrn_reg.php` | 한 번 받아 고정 |
| 1.3 | 기상정보 | `wrn_inf_rpt.php` | 특보 전 예비 정보 |
| 3.1 | 특보 이미지 | `nph-wrn7` | 재해 탭 화면용 |

```
# 특보현황 — 매일 배치
https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php
  ?authKey={KEY}&fe=f&tm=&disp=1&help=0

# 특보구역 코드표 — 최초 1회
https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php
  ?authKey={KEY}&tmfc=0&disp=1

# 특보 이미지 — 좌표 + 반경
https://apihub.kma.go.kr/api/typ03/cgi/wrn/nph-wrn7
  ?authKey={KEY}&lon=128.1574&lat=36.4084&range=300&size=685
  &wrn=W,R,C,D,H,T,S&city=1&name=0&out=0&tmef=1
```

> `wrn_now_data.php`(구버전)와 `wrn_now_data_new.php`가 둘 다 있습니다. **`_new`를 쓰세요.**

### 4-2. `wrn` 특보종류 코드

| 코드 | 특보 | 우리 용도 |
|---|---|---|
| **C** | 한파 | 냉해 — 과수 개화기 · 배추 결구기 |
| **H** | 폭염 | 고온장해 · 일소재해 |
| **D** | 건조 | 가뭄 — 관수 판단 |
| **R** | 호우 | 침수 — 배수 대비 |
| **W** | 강풍 | 낙과 · 도복 · **드론 방제 불가** |
| **T** | 태풍 | 종합 |
| **S** | 대설 | 시설 붕괴 |
| **K** | 한해대야 | 냉해 관련 |
| O·N·V | 해일·지진해일·풍랑 | 해상. 사용 안 함 |
| Y·F | 황사·안개 | 1차 제외 |

우리가 쓸 값: `wrn=C,H,D,R,W,T,S,K`

### 4-3. 특보현황 응답 필드

| 필드 | 뜻 |
|---|---|
| `REG_ID` | 특보구역코드 |
| `REG_KO` | 특보구역명 |
| `REG_UP` / `REG_UP_KO` | 상위 구역 |
| `WRN` | 특보종류 코드 |
| `LVL` | 특보수준 (주의보 / 경보) |
| `TM_FC` | 발표시각 (KST) |
| `TM_EF` | 발효시각 (KST) |
| `CMD` | 특보명령 (발표 / 해제 / 연장) |

**`CMD`를 꼭 보세요.** 해제된 특보가 목록에 남아 있을 수 있습니다.

### 4-4. ⚠ 특보구역은 관측소·격자와 다릅니다

조회 키가 세 종류로 갈립니다.

```
관측소   stn=137           좌표에서 가장 가까운 곳
예보격자  nx, ny            API가 변환 (2.4.2)
특보구역  REG_ID=L1071200   행정구역 기반. 변환 API 없음
```

**특보구역은 자동 변환 API가 없습니다.** `wrn_reg.php`로 받은 코드표에서 행정구역명으로 찾아야 합니다.

`data/ref/warn_regions.csv` (414행, 육상 301 / 해상 113)

```csv
reg_id,reg_up,reg_ko,reg_name,kind
L1000000,00000000,전국,전국,land
L1070000,L1000000,경상북도,경상북도,land
L1071200,L1070000,상주,상주시,land
```

**계층 구조**

```
전국        L1000000
 └ 경상북도  L1070000
    └ 상주   L1071200      ← 하위 구역 없음
```

**세부 구역이 있는 시군도 있습니다.**

```
곡성  L1052900
 ├ 곡성북부  L1052910
 └ 곡성남부  L1052920
```

산간과 평야가 갈리는 곳은 한쪽에만 특보가 내릴 수 있습니다.

### 4-5. 특보 판정 로직

**상위 구역 특보는 하위에도 적용됩니다.** 텃밭 구역 + 상위 전부를 확인해야 합니다.

```python
def my_regions(reg_id, table):
    """텃밭 구역과 상위 구역을 모두 반환"""
    out, cur = [reg_id], reg_id
    while True:
        up = table.get(cur)
        if not up or up == "00000000" or up == cur:
            break
        out.append(up); cur = up
    return out

# 상주 → ["L1071200", "L1070000", "L1000000"]
```

이 중 하나라도 특보 목록에 있으면 우리 밭에 해당.

### 4-6. 매핑 절차

```
① 텃밭 좌표 → 행정구역명      카카오맵 역지오코딩
② 행정구역명 → REG_ID         warn_regions.csv 에서 reg_name 매칭
③ plots.warn_region 에 저장    텃밭 등록 시 1회
```

### 4-7. 안 쓰는 것

```
1.2  특보자료      과거 특보 이력. 통계 분석용
1.4  날씨해설      글로 된 해설문. 파싱 부담
```

---

## 4-B. 예보 (동네예보)

### 쓸 것

| # | 이름 | 엔드포인트 | 용도 |
|---|---|---|---|
| 2.4.2 | **위경도 → 격자 변환** | `nph-dfs_xy_lonlat` | **텃밭 등록 시 필수** |
| 4.3 | 단기예보조회 | `getVilageFcst` | 3일 예보. Open-Meteo 검증 |
| 4.1 | 초단기실황 | `getUltraSrtNcst` | 지금 이 순간 |
| 4.2 | 초단기예보 | `getUltraSrtFcst` | 6시간. 방제 직전 확인 |

```
# 위경도 → 격자
https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_xy_lonlat
  ?authKey={KEY}&lon=128.1574&lat=36.4084&help=0

# 격자 → 위경도 (반대 방향. 같은 엔드포인트)
  ?authKey={KEY}&x=60&y=127&help=1

# 단기예보
https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst
  ?authKey={KEY}&pageNo=1&numOfRows=1000&dataType=JSON
  &base_date=20260913&base_time=0500&nx=..&ny=..
```

**범위** `x` 1~149 · `y` 1~253 · `lon` 123.31~132.77 · `lat` 31.65~43.39

### 단기예보 주요 `category`

```
TMN  일 최저기온   ← 서리 경보
TMX  일 최고기온   ← 적산온도 예측
POP  강수확률      ← 방제 판단
PCP  1시간 강수량
WSD  풍속          ← 방제 가능 여부
VEC  풍향
REH  습도          ← 이슬 판단
SKY  하늘상태
```

### Open-Meteo와의 관계

| | 단위 | 인증 | 예보 기간 |
|---|---|---|---|
| 기상청 단기예보 | 격자 5km | authKey | 3일 |
| Open-Meteo | **좌표** | 불필요 | **16일** |

**주력은 Open-Meteo, 기상청은 검증용.**
같은 시각 두 값을 대조하면 "해외 데이터만 쓴 게 아니라 국내 공식과 맞춰봤다"고 말할 수 있습니다.

### 안 쓰는 것

```
1.x    단기예보자료 아카이브 (2001년~)   예보 검증 통계용
1.5    단기 해상예보                    바다
3.x    통보문 조회                      글로 된 예보문
5, 6   그래픽 분포도                    이미지
7.2    NetCDF 다운로드                  격자 전체. 과함
```

---

## 5. 주의사항

```
1. 경로 2종류    nph- 로 시작하면 cgi-bin. 생성 URL 복사가 확실
2. 조회 키 4종   stn(관측소) / lat·lon(좌표) / nx·ny(예보격자) / REG_ID(특보구역)
3. 시각대 2종    ①②③⑦ KST / ④⑤⑥ UTC. 9시간 어긋남 주의
4. 결측이 -999   null 아님. 반드시 필터
5. disp 확인     JSON(2) 미지원 엔드포인트 있음. CSV로 대체
6. authKey 노출  .env 분리, .gitignore 필수
7. 당일 데이터   집계 중이라 일부 필드가 -999
8. 풍속 단위     m/s (Open-Meteo는 기본 km/h. 섞이면 위험)
9. 시각 형식     HHMM 정수 (1745 = 17:45). 문자열 아님
```

### 결측 처리

```python
def clean(v):
    return None if v is None or v <= -900 else v
```

### 좌표 vs 관측소

```
관측소 기반   상주 관측소 하나 = 시 전체 대표값
좌표 기반     밭 좌표 그대로
```

상주 3지점 실측: 해발 84m 차이가 하루 평균 **0.6℃**.
환산 0.71℃/100m로 표준 기온감률 0.65℃/100m와 일치.
**밭 단위 판정은 좌표로, 국내 공식 검증은 관측소로.**

---

## 6. 우리 스키마 매핑

| 엔드포인트 | → 테이블 | 갱신 |
|---|---|---|
| ① 일통계 | `weather_daily` (kind=obs) | 매일 배치 |
| ② 평년값 | `normals` | 연 1회 |
| ③ 절기재해 | `disaster_rules` 기준값 산출 | 최초 1회 + 절기마다 |
| ④ 기상산출물 LST | `weather_daily.lst_min` | 2차 · 매일 |
| ⑤ 수치모델 | `soil_daily` (신설) | 2차 · 매일 |
| `wrn_now_data_new` | `official_alerts` (신설) | 매일 배치 |
| `wrn_reg` | `warn_regions` (414행) | 최초 1회 |
| `nph-dfs_xy_lonlat` | `plots.nx` `plots.ny` | 텃밭 등록 시 1회 |
| `getVilageFcst` | `weather_daily` (kind=fcst) | 예보 검증 |

### 호출 예시

```python
import os, requests

KEY = os.environ["KMA_API_KEY"]

# 사이트에서 복사한 URL을 상수로. 인증키만 환경변수.
KMA = {
    "일통계":     "https://apihub.kma.go.kr/api/typ01/url/arcltr_sfc_day.php",
    "평년값":     "https://apihub.kma.go.kr/api/typ01/url/arcltr_sfc_norm.php",
    "절기재해":   "https://apihub.kma.go.kr/api/typ01/url/arcltr_solar_term_crop.php",
    "기상산출물": "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sat_txt",
    "수치모델":   "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_nwp_txt",
    "일사량":     "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sat_ana_txt",
    "묶음형":     "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-arcltr_sfc_sts_pkg",
}

def kma(name, disp=2, **params):
    params.update(authKey=KEY, disp=disp)
    r = requests.get(KMA[name], params=params, timeout=60)
    r.raise_for_status()
    return r.json() if disp == 2 else r.text

resp = kma("일통계", stn=137, tm1="20260401", tm2="20260913")
```

```python
from store import normalize_kma_daily, append

df = normalize_kma_daily(resp, plot_id="plot_field")
append("weather_daily", df)
```

---
---

# DOMAIN_REF — Open-Meteo
https://open-meteo.com/

> ECMWF, NOAA, DWD, Météo-France, JMA, KMA 등 15개 이상 국가 기상청의 수치예보 모델을 통합 제공하며, API 키 없이 무료로 쓸 수 있고 CC BY 4.0 라이선스입니다.
> 기상청에 비해 사용자의 밭 좌표 중심으로 바로 조회되고 인증이 없어 사용이 용이합니다.
> 동네예보를 충분히 대체가능합니다.
> 표준 지표 변수 외에도 여러 깊이의 토양 수분과 온도, 일사량, 다중 고도 풍속을 제공하고, 1940년부터의 ERA5 재분석 자료를 시간 단위로 결측 없이 제공합니다.

---

## 0. 시작하기

```
인증        불필요. API 키 없음
라이선스     CC BY 4.0 (출처 표기 조건)
호출 제한    비상업 이용 하루 1만 건 (넉넉함)
기반 모델    ECMWF · NOAA GFS · DWD ICON · JMA · KMA 등 15종 이상
```

**주소창에 붙여넣으면 바로 결과가 나옵니다.** 개발 전에 눈으로 확인하기 좋습니다.

### 엔드포인트 세 개

| 용도 | 주소 | 기간 |
|---|---|---|
| 예보 | `api.open-meteo.com/v1/forecast` | 오늘 ~ 16일 |
| 과거 실측 | `archive-api.open-meteo.com/v1/archive` | 1940년 ~ 5일 전 |
| 대기질 | `air-quality-api.open-meteo.com/v1/air-quality` | (미사용) |

**예보와 과거는 주소가 다릅니다.** 같은 주소로 과거를 부르면 안 나옵니다.

---

## 1. 공통 파라미터

```
latitude      36.4084          필수
longitude     128.1574         필수
timezone      Asia/Seoul       필수. 없으면 UTC 기준으로 날짜가 밀림
wind_speed_unit  ms            ⚠ 기본이 km/h. 반드시 지정
temperature_unit celsius       기본값
precipitation_unit mm          기본값
forecast_days    1~16          예보 전용. 기본 7
past_days        0~92          예보 주소에서 최근 과거도 함께
start_date / end_date  yyyy-mm-dd   과거 주소 전용
```

### ⚠ `wind_speed_unit=ms` 를 빠뜨리면

```
기본값 km/h 로 5.6 이 나옴  →  실제로는 1.56 m/s
```

드론 방제 기준이 3.0 m/s인데 km/h 값을 그대로 비교하면 **전부 "바람 셈"으로 판정**됩니다.
기상청은 m/s로 주므로 섞이면 더 위험합니다.

---

## 2. 우리가 쓰는 변수

### 일별 `daily=`

| 변수 | 뜻 | 쓰는 곳 |
|---|---|---|
| `temperature_2m_max` | 일 최고기온 | **적산온도 계산** |
| `temperature_2m_min` | 일 최저기온 | **적산온도 · 서리 판정** |
| `precipitation_sum` | 일 강수량 | 관수 판단 |
| `sunrise` / `sunset` | 일출 · 일몰 | **방제 시각** |
| `wind_speed_10m_max` | 최대 풍속 | 방제 가능 여부 |
| `wind_gusts_10m_max` | 순간최대풍속 | 강풍 경보 |
| `relative_humidity_2m_mean` | 평균 습도 | 이슬 · 병해 판정 |
| `shortwave_radiation_sum` | 일사량 합 | "볕이 충분했다" |
| `et0_fao_evapotranspiration` | 증발산량 | **관수량 계산** |

**증발산량이 의외로 중요합니다.** 비가 온 양만 보면 부족하고, 증발한 양을 빼야 실제 물 부족이 나옵니다.

### 시간별 `hourly=`

| 변수 | 뜻 | 쓰는 곳 |
|---|---|---|
| `temperature_2m` | 기온 | 방제 시간대 판정 |
| `relative_humidity_2m` | 습도 | **이슬 판정** |
| `precipitation_probability` | 강수확률 | 방제 판정 |
| `wind_speed_10m` | 풍속 | 방제 판정 |
| `wind_direction_10m` | **풍향** (0~360°) | 약 날림 방향 |
| `wind_gusts_10m` | 순간풍속 | |
| `soil_moisture_0_to_7cm` | 표층 토양수분 | 관수 판단 |
| `soil_moisture_7_to_28cm` | 뿌리층 수분 | |
| `soil_temperature_0_to_7cm` | **지온** | 파종 가능 판정 |

**지온이 파종 판정에 쓰입니다.** 농진청 직파 문서는 기온 기준(13~15℃)이지만 감자처럼 지온이 더 중요한 작물이 있습니다.

### 응답에 자동으로 딸려오는 것

```
elevation        해발고도 (m)    ← 요청 안 해도 나옴
utc_offset_seconds
timezone_abbreviation
```

`elevation`은 요긴합니다. 농진청 문서에 재배적지 표고 조건이 있습니다.

```
벼 중모   중북부 300m · 남부 350m 이하
벼 직파   200m 이하
```

---

## 3. 호출 예시

### 3-1. 예보 — 기본

```
https://api.open-meteo.com/v1/forecast
  ?latitude=36.4084&longitude=128.1574
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
  &timezone=Asia/Seoul
```

### 3-2. 예보 — 드론 방제 판정용 (실사용)

```
https://api.open-meteo.com/v1/forecast
  ?latitude=36.4084&longitude=128.1574
  &daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,
         precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max
  &hourly=temperature_2m,relative_humidity_2m,precipitation_probability,
          wind_speed_10m,wind_direction_10m,wind_gusts_10m
  &timezone=Asia/Seoul
  &wind_speed_unit=ms
  &forecast_days=3
```

### 3-3. 과거 실측 — 적산온도 소급 계산

```
https://archive-api.open-meteo.com/v1/archive
  ?latitude=36.4084&longitude=128.1574
  &start_date=2026-04-01&end_date=2026-09-12
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
  &timezone=Asia/Seoul
```

**파종일이 과거인 사용자**의 누적 적산온도를 채울 때 씁니다.

### 3-4. 과거 30년 — 평년값 산출

```
https://archive-api.open-meteo.com/v1/archive
  ?latitude=36.4084&longitude=128.1574
  &start_date=1991-01-01&end_date=2020-12-31
  &daily=temperature_2m_max,temperature_2m_min,precipitation_sum
  &timezone=Asia/Seoul
```

약 11,000줄. 브라우저로 열면 버벅이므로 파이썬으로 받으세요.
**한 번 계산해 `data/ref/normals.csv`로 고정**하면 됩니다.

### 3-5. 여러 지점 한 번에 — 바람 격자

좌표를 콤마로 이으면 배열로 돌아옵니다.

```
https://api.open-meteo.com/v1/forecast
  ?latitude=35.1,35.1,35.3,35.3
  &longitude=127.1,127.3,127.1,127.3
  &hourly=wind_speed_10m,wind_direction_10m
  &timezone=Asia/Seoul&wind_speed_unit=ms
```

**응답이 지점마다 객체인 배열**로 바뀝니다. 단일 좌표일 때와 구조가 다르니 주의.

### 3-6. 모델 지정 — 국가별 예보 비교

```
&models=kma_seamless      한국 기상청
&models=jma_gsm           일본 기상청 (전지구. 한국 포함)
&models=ecmwf_ifs025      유럽중기예보센터
&models=gfs_seamless      미국 NOAA
```

콤마로 여러 개를 넣으면 변수명에 모델이 붙어 함께 옵니다.

```
temperature_2m_max_kma_seamless
temperature_2m_max_jma_gsm
```

> 농민 인터뷰: "한국 예보는 민원 때문에 과장된다. 일본 예보를 본다."
> 세 모델을 나란히 보여주면 그 요구가 해결됩니다.
> `jma_msm`은 일본 국지 모델이라 한국을 벗어납니다. **한국은 `jma_gsm`.**

---

## 4. 응답 구조

```json
{
  "latitude": 36.4,
  "longitude": 128.1875,
  "elevation": 74.0,
  "utc_offset_seconds": 32400,
  "timezone": "Asia/Seoul",
  "daily_units": { "temperature_2m_max": "°C" },
  "daily": {
    "time": ["2026-09-13", "2026-09-14"],
    "temperature_2m_max": [27.2, 26.4],
    "temperature_2m_min": [16.7, 17.9]
  }
}
```

### ⚠ 배열 구조입니다

`time`과 각 변수 배열의 **인덱스가 짝**입니다. 레코드 배열이 아닙니다.

```python
d = resp["daily"]
for i, t in enumerate(d["time"]):
    tmax = d["temperature_2m_max"][i]
```

### ⚠ 요청 좌표와 응답 좌표가 다릅니다

```
요청  36.4084, 128.1574
응답  36.4,    128.1875
```

모델 격자에서 가장 가까운 점으로 스냅됩니다. **정상입니다.**
`elevation`도 그 격자점 고도라 실제 밭 고도와 조금 다를 수 있습니다.

### 결측은 `null`

기상청과 다릅니다.

```
기상청       -999
Open-Meteo   null
```

---

## 5. 실측으로 확인한 것

### 5-1. 고도가 기온에 반영됩니다

상주 3지점 · 2026-09-13

| 밭 | 해발 | 기온 |
|---|---|---|
| 낙동강변 논 | 60m | 17.1 ~ 27.0℃ |
| 배추밭 | 74m | 16.7 ~ 27.2℃ |
| 단감 과수원 | 158m | 16.1 ~ 26.6℃ |

해발 84m 차이 → 하루 평균 **0.6℃**
환산 **0.71℃/100m**. 표준 기온감률 0.65℃/100m와 일치.

**한 철 백 일이면 적산온도가 60도 가까이 벌어집니다.**
시군 평균으로는 잡히지 않는 차이. 좌표 조회를 쓰는 이유입니다.

### 5-2. 일출·일몰에는 고도가 반영되지 않습니다

상주 3지점 모두 `06:07 / 18:38`로 동일.
몇 km 차이로는 분 단위가 갈리지 않습니다.

**직접 천문 계산하지 마세요.** 자체 계산 결과가 Open-Meteo와 1~2분 어긋났습니다.
대기굴절 처리가 달라서입니다. API 값을 그대로 쓰는 게 맞습니다.

### 5-3. 지형에 따라 바람이 크게 갈립니다

곡성 반경 20km · 6지점 동시 조회

```
평지 (해발  92m)   3.2 km/h
산지 (해발 965m)   9.4 km/h    ← 3배
```

저녁에는 평지 3.2 / 산지 9.4로 더 벌어졌습니다.
풍향도 갈립니다 — 새벽 6시 평지 동북동(45°) vs 산지 서북서(297°).

---

## 6. 우리 스키마 매핑

| 호출 | → 테이블 | 갱신 |
|---|---|---|
| `/forecast` daily | `weather_daily` (kind=fcst) | 매일 배치 |
| `/archive` daily | `weather_daily` (kind=obs) | 파종일 소급 시 |
| `/archive` 30년 | `normals` | 최초 1회 |
| `/forecast` hourly | `today_field.json` (캐시) | 볼 때마다 |

**예보가 실측으로 자동 교체됩니다.** 같은 `(plot_id, date)` 키로 append하면 나중에 온 실측이 예보를 덮어씁니다.

```python
from store import normalize_openmeteo_daily, append

resp = requests.get(FORECAST, params={...}).json()
df = normalize_openmeteo_daily(resp, plot_id="plot_field", kind="fcst")
append("weather_daily", df)
```

---

## 7. 기상청과 역할 분담

| | Open-Meteo | 기상청 API허브 |
|---|---|---|
| 조회 단위 | **좌표** | 관측소 · 격자 · 특보구역 |
| 인증 | 불필요 | authKey |
| 예보 기간 | **16일** | 3일 |
| 과거 | **1940년~** | 관측 개시일~ |
| 토양수분 | 있음 | 수치모델에 있음 |
| 일출입 | 있음 | 없음 |
| 국내 공신력 | 없음 | **있음** |
| 특보 | 없음 | **있음** |

```
주력    Open-Meteo    밭 단위 판정 · 적산온도 · 방제 시각
검증    기상청         국내 공식 실측과 대조
전용    기상청         특보 · 절기별 재해 · 초상온도
```

발표에서 "해외 데이터만 쓴 게 아니라 국내 공식과 맞춰봤다"고 말할 수 있습니다.

---

## 8. 주의사항

```
1. wind_speed_unit=ms   기본 km/h. 안 바꾸면 방제 판정이 전부 틀림
2. timezone=Asia/Seoul  없으면 UTC 기준으로 날짜가 밀림
3. 주소 2종             예보 api / 과거 archive-api
4. 배열 구조            time 인덱스와 짝. 레코드 배열 아님
5. 결측 null            기상청(-999)과 다름
6. 좌표 스냅            요청 좌표와 응답 좌표가 다른 게 정상
7. 다중 좌표            응답이 배열로 바뀜. 단일과 구조 다름
8. archive 지연         최근 5일은 아직 없음. 그 구간은 forecast 의 past_days 사용
9. 일출입 자체계산 금지  API 값이 정확
10. 출처 표기           CC BY 4.0. README·발표자료에 명시
```

### 출처 표기

```
Weather data by Open-Meteo.com (CC BY 4.0)
https://open-meteo.com/
```

---

## 9. 미확인 · 다음 작업

```
[ ] 평년값 30년 수집 → normals.csv
    (기상청 arcltr_sfc_norm 과 대조 예정)
[ ] et0 증발산량 실제 값 확인 — 관수량 계산에 쓸 수 있는지
[ ] soil_moisture 단위 확인 (m³/m³ 인지)
[ ] models= 다중 모델 응답 구조 확인
[ ] past_days 와 archive 이어붙이기 검증
```

---
---

# DOMAIN_REF — Copernicus Sentinel-2
https://browser.dataspace.copernicus.eu/?zoom=7&lat=37.95285&lng=126.73312&themeId=DEFAULT-THEME&visualizationUrl=U2FsdGVkX1%2F6nol0nWJ7UQub8E3W16Fm%2BtRWZB0AFaCo9QEY3Osw2pjwvvWHEtc3dVQ7Db5PK2fShpT39%2FmhiDg%2B8sLfbMPYYf2bTlcc0yvN1yj6rBsuxms%2FstED0meY&datasetId=S2_L2A_CDAS&demSource3D=%22MAPZEN%22&cloudCoverage=30&dateMode=SINGLE

> 적산온도 판정이 맞는지 확인하는 쪽이지, 주력이 아닙니다.
> 이유는 5-1 결측률 참조.

> api 가이드 페이지 : https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/UserGuides/BeginnersGuide.html

---

## 0. 시작하기

```
제공        ESA / EU Copernicus Data Space Ecosystem
위성        Sentinel-2 A/B/C
센서        MSI (Multispectral Instrument)
재방문       5일 (2기 조합)
데이터셋     sentinel-2-l2a  ← 대기보정 완료본
라이선스     Copernicus 무료·개방
```

### 인증 — OAuth client_credentials

CDSE 계정 → Sentinel Hub Dashboard → User Settings → OAuth clients

```
# .env
SH_CLIENT_ID=...
SH_CLIENT_SECRET=...
```

**`client_secret`은 발급 시 한 번만 보입니다.** 놓치면 클라이언트를 지우고 새로 만들어야 합니다.

### 토큰 받기

```
POST https://identity.dataspace.copernicus.eu
     /auth/realms/CDSE/protocol/openid-connect/token

grant_type=client_credentials
client_id=...
client_secret=...
```

응답의 `access_token`을 헤더에 실어 씁니다. 유효기간 약 10분.

```python
def get_token():
    r = requests.post(TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SH_CLIENT_ID"],
        "client_secret": os.environ["SH_CLIENT_SECRET"],
    }, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]
```

### API 세 종류

| API | 주소 | 돌려주는 것 | 우리 용도 |
|---|---|---|---|
| **Statistical** | `/api/v1/statistics` | **숫자** (평균·표준편차) | **주력** |
| Process | `/api/v1/process` | 이미지 (PNG/TIFF) | 지도 표시 (2차) |
| Catalog | `/api/v1/catalog` | 관측 가능 날짜 목록 | 결측 예측 (2차) |

호스트: `https://sh.dataspace.copernicus.eu`

**Statistical API를 씁니다.** 영상 파일을 통째로 받지 않고 계산된 숫자만 받으므로 응답이 수십 KB입니다.

---

## 1. 밴드와 지수

### 받는 밴드

| 밴드 | 이름 | 해상도 | 쓰는 곳 |
|---|---|---|---|
| `B03` | Green | 10m | NDWI |
| `B04` | Red | 10m | NDVI |
| `B08` | NIR 근적외 | 10m | **세 지수 전부** |
| `B11` | SWIR1 단파적외 | **20m** | NDMI |
| `SCL` | 장면 분류 | 20m | 구름 제거 |
| `dataMask` | 유효 영역 | — | 가장자리 처리 |

**`B08`이 세 지수에 다 들어갑니다.** 근적외선이 식생 판독의 핵심입니다.

### 계산식

```
NDVI = (B08 - B04) / (B08 + B04)     잎이 우거진 정도
NDWI = (B03 - B08) / (B03 + B08)     물이 있나
NDMI = (B08 - B11) / (B08 + B11)     잎 속 수분
```

### ⚠ NDMI만 20m입니다

`B11`이 20m라 NDMI는 실질 20m 정밀도입니다.
텃밭 단위는 무리, 논이나 과수원처럼 넓은 필지에서만 의미가 있습니다.

### 안 받는 밴드

```
B02 Blue          자연색 이미지용. 지수엔 불필요
B01 B09           60m. 대기보정용이라 L2A에선 불필요
B05~B07 B8A       Red Edge 20m. 질소 추정용 (2차)
B12 SWIR2         NBR 산불용. 미사용
```

**"혹시 몰라서" 넣지 마세요.** 밴드가 늘면 처리량(PU) 소모가 커집니다.

---

## 2. 구름 제거 — SCL

Sentinel-2가 픽셀마다 붙여둔 분류값입니다.

| SCL | 뜻 | 처리 |
|---|---|---|
| 3 | 구름 그림자 | **제외** |
| 8 | 구름 중간확률 | **제외** |
| 9 | 구름 높은확률 | **제외** |
| 10 | 권운 | **제외** |
| 11 | 눈 · 얼음 | **제외** |
| 4 | 식생 | 사용 |
| 5 | 비식생 | 사용 |
| 6 | 물 | 사용 |

```javascript
let bad = [3, 8, 9, 10, 11].includes(s.SCL);
let valid = (s.dataMask === 1 && !bad) ? 1 : 0;
```

### 유효 픽셀 비율로 한 번 더 거릅니다

```
유효 픽셀 70% 미만인 날  →  값을 null 로, is_valid = N
```

**70%를 넘겨도 튀는 값이 있습니다.** 상주 과수원 9/5에 NDVI 0.428이 나왔는데 앞뒤가 0.7대였습니다. 부분 구름으로 보입니다. 이상치 제거가 한 번 더 필요합니다.

---

## 3. evalscript

세 지수를 **한 번의 요청**으로 받습니다.

```javascript
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03","B04","B08","B11","SCL","dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndwi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(s) {
  let bad = [3, 8, 9, 10, 11].includes(s.SCL);
  let valid = (s.dataMask === 1 && !bad) ? 1 : 0;
  return {
    ndvi: [(s.B08 - s.B04) / (s.B08 + s.B04)],
    ndwi: [(s.B03 - s.B08) / (s.B03 + s.B08)],
    ndmi: [(s.B08 - s.B11) / (s.B08 + s.B11)],
    dataMask: [valid]
  };
}
```

**지수를 추가해도 호출 횟수는 그대로입니다.** output에 한 줄 더 넣으면 됩니다.

`sampleType: "FLOAT32"`를 빠뜨리면 소수가 잘립니다.

---

## 4. Statistical API 요청

```python
payload = {
  "input": {
    "bounds": {
      "bbox": [lon-0.002, lat-0.002, lon+0.002, lat+0.002],
      "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}
    },
    "data": [{
      "type": "sentinel-2-l2a",
      "dataFilter": {"mosaickingOrder": "leastCC"}
    }]
  },
  "aggregation": {
    "timeRange": {"from": "2026-04-01T00:00:00Z", "to": "2026-09-13T23:59:59Z"},
    "aggregationInterval": {"of": "P1D"},
    "resx": 10, "resy": 10,
    "evalscript": EVALSCRIPT
  }
}

requests.post(STATS_URL, json=payload,
              headers={"Authorization": f"Bearer {token}"})
```

### bbox 크기

```
±0.002   약 400m 사각형   ← 텃밭·필지 단위 권장
±0.005   약 1km
```

**너무 넓게 잡으면 옆 밭·도로·강이 섞입니다.** 곡성에서 실제로 겪었습니다(5-2 참조).

### `aggregationInterval`

```
P1D   하루 단위    ← 기본. 관측 없는 날은 결과에 안 나옴
P5D   5일 단위
P1M   월 단위
```

### `mosaickingOrder`

```
leastCC        구름 적은 것 우선   ← 권장
mostRecent     최신 우선
leastRecent    오래된 것 우선
```

---

## 5. 응답 구조

```json
{ "data": [
  { "interval": { "from": "2026-09-12T00:00:00Z", "to": "..." },
    "outputs": {
      "ndvi": { "bands": { "B0": { "stats": {
        "mean": 0.5496, "min": 0.31, "max": 0.72, "stDev": 0.08,
        "sampleCount": 1600, "noDataCount": 0
      }}}}
    }}
]}
```

### 유효 픽셀 비율 계산

```python
total   = stats["sampleCount"]
nodata  = stats["noDataCount"]
valid_pct = (total - nodata) / total * 100
```

`dataMask`가 0인 픽셀이 `noDataCount`로 잡힙니다.

### ⚠ `outputs`가 없는 항목이 섞입니다

에러가 난 날은 `outputs` 대신 `error`가 옵니다. 건너뛰세요.

```python
for item in resp.get("data", []):
    if "outputs" not in item:
        continue
```

---

## 6. 실측으로 확인한 것

### 6-1. 결측이 절반을 넘습니다

```
곡성 장선리   15회 시도 · 8회 결측   (53%)
상주 논       75회 시도 · 42회 결측  (56%)
상주 배추밭   75회 시도 · 42회 결측  (56%)
상주 과수원   75회 시도 · 38회 결측  (51%)
```

**이것이 위성이 주력이 될 수 없는 이유입니다.**
기온이 주력이고 위성은 확인용입니다. 4~9월 반년을 봐도 유효 관측이 30여 일뿐입니다.

### 6-2. 좌표를 잘못 찍으면 값이 죽습니다

곡성 시가지 좌표 (군청 부근)

```
05-01  0.308     05-16  0.341
05-06  0.332     05-31  0.349
05-11  0.283     06-15  0.342
```

**6주간 평평합니다.** 건물은 계절이 바뀌어도 안 자랍니다.
NDMI가 0 근처(-0.01~-0.04)인 것이 결정적 단서였습니다. 식생이면 0.2~0.4가 나옵니다.

같은 시기, 400m 떨어진 논 좌표

```
05-01  0.5584     05-31  0.2473
05-06  0.5609     06-15  0.1644
```

**모내기가 그대로 찍혔습니다.** 논을 갈고 물을 대면 초록이 사라집니다.
NDMI가 0.28 → -0.065로 음수가 된 것이 물을 댔다는 증거입니다.

> 텃밭 등록 화면에서 **지도 핀을 정확히 찍게 하는 이유**가 이것입니다.
> 몇십 미터만 어긋나도 옆 밭이나 도로를 읽습니다.

### 6-3. 같은 숫자가 다른 뜻입니다

```
NDVI 0.16이 6월이면   모내기 직후. 정상
NDVI 0.16이 8월이면   고사. 심각
```

**날짜와 생육단계를 모르면 이 숫자는 읽을 수 없습니다.**
위성 지수를 단독으로 쓰지 않고 적산온도와 결합하는 근거입니다.

### 6-4. 밭마다 값이 다릅니다

상주 3지점 · 2026-09-12

| 밭 | NDVI | NDWI | NDMI |
|---|---|---|---|
| 낙동강변 논 | 0.5968 | -0.5585 | 0.2658 |
| 배추밭 | 0.5496 | -0.5526 | 0.2512 |
| 단감 과수원 | **0.7157** | -0.6607 | 0.2264 |

과수원이 늘 가장 높습니다. 나무라 잎이 많습니다.

**과수원만 4월 초 NDMI가 음수(-0.09)였습니다.** 감나무에 아직 잎이 나기 전이라 맨 가지와 흙이 보인 것입니다. 4월 하순에 양수로 올라섭니다.
→ **위성으로 잎 난 시기를 알 수 있습니다.**

### 6-5. 미해결 — 상주 논 좌표

```
곡성 실제 논   5/1 0.56 → 6/15 0.16   모내기 포착
상주 논 좌표   5/31 0.62 → 6/15 0.65   상승. 모내기 없음
```

실제 논이 아니거나 좌표 재확인 필요.

---

## 7. 지수 활용 — 밭마다 다릅니다

**위성은 판정이 아니라 반대심문입니다.**
적산온도가 "이쯤이면 이래야 한다"고 계산하면 위성이 "실제로 그런가"를 봅니다.

```
계산: 지금 결구가 시작될 때
관측: NDVI가 실제로 오르나
─────────────────────────
맞아떨어짐             → 잘 크고 있습니다
NDVI 정체·하락         → 생육이 더딥니다
NDVI 유지 + NDMI 하락  → 물이 모자랍니다
```

| | NDVI | NDWI | NDMI |
|---|---|---|---|
| **논** | 적산온도 진행과 대조 | **물떼기 확인** | 물이 차 있어 의미 약함 |
| **밭** | 결구 진행 확인 | 호우 뒤 침수 탐지 | **가뭄 판정 보강** |
| **과수** | 잎 밀도 · 낙엽 시기 | 거의 안 씀 | 일소재해 뒤 스트레스 |

### 논 — NDWI로 물떼기 확인

농진청 벼 문서

```
중간물떼기   무효분얼기(이삭패기 전 30~40일)에 5~10일간
완전물떼기   이삭팬 후 30~35일
```

**물을 뺐어야 할 시기에 실제로 뺐는지** 위성으로 확인할 수 있습니다.

### 밭 — NDMI가 반대심문

강수량만으로는 관수 여부를 모릅니다.

```
강수 0mm + NDMI 유지   → 물을 주셨구나
강수 0mm + NDMI 하락   → 정말 마르고 있다
```

---

## 8. 처리량(PU) 관리

무료 계정에 월 한도가 있습니다. 대시보드에서 사용량 확인.

**소모를 늘리는 요인**

```
밴드 수         B02 등 안 쓰는 밴드 제외
기간 길이       3지점 × 5개월이면 꽤 먹음
해상도 resx/resy  10m 유지. 더 낮추면 소모 증가
bbox 크기       ±0.002 권장
```

한도가 걱정되면 `DATE_FROM`을 줄이세요.

---

## 9. 우리 스키마 매핑

| 호출 | → 테이블 | 갱신 |
|---|---|---|
| Statistical API | `satellite_obs` | 매일 배치 (관측 있는 날만) |

```
plot_id · date · ndvi · ndwi · ndmi · valid_pct · is_valid · source
```

```python
from store import normalize_sentinel, append

df = normalize_sentinel(stats, plot_id="plot_field", min_valid=70.0)
append("satellite_obs", df)
```

`source` 컬럼으로 `sentinel2` / `cas500-1` / `gk2a` 를 구분합니다.

---

## 10. 다른 위성과 역할 분담

| | 해상도 | 주기 | 역할 |
|---|---|---|---|
| **Sentinel-2** | 10m (B11 20m) | 5일 | **텃밭 NDVI·NDMI 시계열** |
| 국토위성 1호 | 2m | 월 1~3회 | 특정 시점 정밀 확인 |
| 천리안 2A | 1km | 2분 | 지역 온도·재해 신호 |
| 농림위성 | 5m | 3일 | **2027년 개방 예정** |

**해상도와 빈도가 반비례합니다.** 농림위성이 그 중간을 메웁니다.

### 국토위성 제약 (실제 확인)

```
좌표계     GeoTIFF에 미포함. _Aux.xml 모서리 좌표로 보정 필요
값 형식    12비트 원시값(DN). 반사율 아님 → 날짜 간 비교 불가
SWIR 없음  NDMI 계산 불가
파일 크기  한 장면 8.6GB (팬샤프닝 포함)
```

`_PS`(팬샤프닝) 파일은 받지 마세요. 합성 과정에서 원본 밴드값이 변형돼 지수 계산에 해롭습니다.

---

## 11. 주의사항

```
1. 토큰 10분     만료되면 재발급. 장시간 작업 시 갱신 로직 필요
2. secret 1회    발급 시 한 번만 표시
3. SCL 필수      안 쓰면 구름 낀 값이 섞여 평균이 깨짐
4. 유효 70%      넘어도 이상치 있음. 한 번 더 검사
5. B11만 20m     NDMI는 실질 20m
6. bbox 크기     ±0.002 권장. 넓으면 옆 밭 섞임
7. outputs 없음  에러 항목이 섞임. 건너뛰기
8. 시각 UTC      timeRange 는 Z 표기
9. FLOAT32       빠뜨리면 소수 잘림
10. PU 한도      밴드·기간 늘리면 소모 증가
```

---

## 12. 미확인 · 다음 작업

```
[ ] 상주 논 좌표 재선정 (모내기 신호 미검출)
[ ] 이상치 제거 규칙 — 앞뒤 대비 0.12 이상 급락 시 폐기?
[ ] Catalog API 로 관측 예정일 미리 알기
[ ] Process API 로 NDVI 지도 이미지 (2차)
[ ] 평년 NDVI 곡선 — 과거 5년 수집해 편차 판정
[ ] PU 사용량 실측
```

---

## 출처 표기

```
Contains modified Copernicus Sentinel data (2026)
processed by Sentinel Hub
```