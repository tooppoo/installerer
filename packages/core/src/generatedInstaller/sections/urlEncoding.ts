export function renderUrlEncoding(): string {
  return `url_encode_segment() {
  value=$1
  encoded=
  hex_bytes=$(LC_ALL=C printf '%s' "$value" | od -An -tx1 -v | tr -d ' \\n')

  while [ -n "$hex_bytes" ]; do
    byte=$(printf '%s' "$hex_bytes" | cut -c 1-2)
    hex_bytes=$(printf '%s' "$hex_bytes" | cut -c 3-)
    case "$byte" in
      2d) encoded="$encoded-" ;;
      2e) encoded="$encoded." ;;
      5f) encoded="$encoded"_ ;;
      7e) encoded="$encoded~" ;;
      30) encoded="$encoded"0 ;;
      31) encoded="$encoded"1 ;;
      32) encoded="$encoded"2 ;;
      33) encoded="$encoded"3 ;;
      34) encoded="$encoded"4 ;;
      35) encoded="$encoded"5 ;;
      36) encoded="$encoded"6 ;;
      37) encoded="$encoded"7 ;;
      38) encoded="$encoded"8 ;;
      39) encoded="$encoded"9 ;;
      41) encoded="$encoded"A ;;
      42) encoded="$encoded"B ;;
      43) encoded="$encoded"C ;;
      44) encoded="$encoded"D ;;
      45) encoded="$encoded"E ;;
      46) encoded="$encoded"F ;;
      47) encoded="$encoded"G ;;
      48) encoded="$encoded"H ;;
      49) encoded="$encoded"I ;;
      4a) encoded="$encoded"J ;;
      4b) encoded="$encoded"K ;;
      4c) encoded="$encoded"L ;;
      4d) encoded="$encoded"M ;;
      4e) encoded="$encoded"N ;;
      4f) encoded="$encoded"O ;;
      50) encoded="$encoded"P ;;
      51) encoded="$encoded"Q ;;
      52) encoded="$encoded"R ;;
      53) encoded="$encoded"S ;;
      54) encoded="$encoded"T ;;
      55) encoded="$encoded"U ;;
      56) encoded="$encoded"V ;;
      57) encoded="$encoded"W ;;
      58) encoded="$encoded"X ;;
      59) encoded="$encoded"Y ;;
      5a) encoded="$encoded"Z ;;
      61) encoded="$encoded"a ;;
      62) encoded="$encoded"b ;;
      63) encoded="$encoded"c ;;
      64) encoded="$encoded"d ;;
      65) encoded="$encoded"e ;;
      66) encoded="$encoded"f ;;
      67) encoded="$encoded"g ;;
      68) encoded="$encoded"h ;;
      69) encoded="$encoded"i ;;
      6a) encoded="$encoded"j ;;
      6b) encoded="$encoded"k ;;
      6c) encoded="$encoded"l ;;
      6d) encoded="$encoded"m ;;
      6e) encoded="$encoded"n ;;
      6f) encoded="$encoded"o ;;
      70) encoded="$encoded"p ;;
      71) encoded="$encoded"q ;;
      72) encoded="$encoded"r ;;
      73) encoded="$encoded"s ;;
      74) encoded="$encoded"t ;;
      75) encoded="$encoded"u ;;
      76) encoded="$encoded"v ;;
      77) encoded="$encoded"w ;;
      78) encoded="$encoded"x ;;
      79) encoded="$encoded"y ;;
      7a) encoded="$encoded"z ;;
      *) encoded="$encoded%$(printf '%s' "$byte" | tr 'abcdef' 'ABCDEF')" ;;
    esac
  done

  printf '%s' "$encoded"
}

`;
}
