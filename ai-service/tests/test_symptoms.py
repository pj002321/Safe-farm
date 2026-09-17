from app.domain.symptoms import expand_symptoms, symptom_candidates


def test_반점은_노균병_후보를_낸다():
    assert "노균병" in symptom_candidates("배추에 반점이 올라오는데")


def test_녹는다는_무름병():
    assert "무름병" in symptom_candidates("배추가 녹아요")


def test_증상말이_없으면_원문_그대로():
    q = "콩나물 키우려는데 어떤 콩이 좋아?"
    assert expand_symptoms(q) == q
    assert symptom_candidates(q) == []


def test_같은_병은_한_번만():
    # 시들음 → 역병, 반점 → 탄저병… 겹치는 게 있어도 한 번만
    c = symptom_candidates("시들고 반점도 있어요")
    assert len(c) == len(set(c))
