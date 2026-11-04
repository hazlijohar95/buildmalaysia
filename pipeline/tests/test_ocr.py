"""The OCR reader's acceptance rule: a reading must fit the shape the glyph boxes give."""

from pipeline.ocr import _Box, fits, shape


def _digit(x: float, narrow: bool = False) -> _Box:
    return _Box(x, 10.0, x + (1.4 if narrow else 2.7), 14.05)


def test_shape_reads_digits_ones_and_punctuation_from_glyph_boxes() -> None:
    comma = _Box(4.5, 13.5, 5.06, 14.95)  # reaches below the baseline
    period = _Box(14.0, 13.4, 14.68, 14.05)
    glyphs = [_digit(0, narrow=True), comma, _digit(6), _digit(9), _digit(12), period, _digit(15), _digit(18)]
    assert shape(glyphs) == "1,DDD.DD"
    assert shape([_Box(0, 11.8, 3.3, 12.25)]) == "–"


def test_a_reading_must_fit_its_shape_character_for_character() -> None:
    assert fits("1,055.90", "1,DDD.DD")
    assert not fits("1,055,90", "1,DDD.DD")  # a period read as a comma
    assert not fits("1,155.90", "1,DDD.DD")  # a 1 where the glyph is a wide digit
    assert not fits("7,055.90", "1,DDD.DD")  # a wide digit where the glyph is narrow
    assert not fits("1,05.90", "1,DDD.DD")
    assert fits("-", "–")
