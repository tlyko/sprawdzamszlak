resource "aws_dynamodb_table" "sprawdzamszlak_table" {
  name         = local.sprawdzamszlak_table.name
  billing_mode = local.sprawdzamszlak_table.billing_mode
  hash_key     = local.sprawdzamszlak_table.hash_key

  dynamic "attribute" {
    for_each = local.sprawdzamszlak_table.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }
}

resource "aws_dynamodb_table_item" "giewont_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key

  item = jsonencode(
    {
      "id" = { "S" = "giewont" },
      "nazwa" = { "S" = "Giewont" },
      "trudnosc" = { "S" = "Umiarkowany" },
      "latitude" = { "N" = "49.251005" },
      "longitude" = { "N" = "19.934084" },
      "height" = { "N" = "1895" },
      "description_html" = { "S" = "Charakterystyczny szczyt z krzyżem. Widok na Zakopane." }
    }
  )
}

resource "aws_dynamodb_table_item" "rysy_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id" = { "S" = "rysy" },
      "nazwa" = { "S" = "Rysy" },
      "trudnosc" = { "S" = "Trudny" },
      "latitude" = { "N" = "49.1794" },
      "longitude" = { "N" = "20.0883" },
      "height" = { "N" = "2503" },
      "description_html" = { "S" = "Najwyższy szczyt Polski. Wymagający szlak z łańcuchami." }
    }
  )
}

resource "aws_dynamodb_table_item" "koscielec_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id" = { "S" = "koscielec" },
      "nazwa" = { "S" = "Kościelec" },
      "trudnosc" = { "S" = "Trudny (bez łańcuchów)" },
      "latitude" = { "N" = "49.225179" },
      "longitude" = { "N" = "20.014583" },
      "height" = { "N" = "2155" },
      "description_html" = { "S" = "Piramida skalna, popularny cel wspinaczkowy i turystyczny." }
    }
  )
}

resource "aws_dynamodb_table_item" "gerlach_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "gerlach" },
      "nazwa"     = { "S" = "Gerlach (Gerlachovský štít)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I (Droga Martina)" },
      "latitude"  = { "N" = "49.164028" },
      "longitude" = { "N" = "20.134028" },
      "height"    = { "N" = "2655" },
      "description_html" = { "S" = "Najwyższy szczyt Tatr i całych Karpat. Należy do Wielkiej Korony Tatr." }
    }
  )
}

resource "aws_dynamodb_table_item" "lomnica_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "lomnica" },
      "nazwa"     = { "S" = "Łomnica (Lomnický štít)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem (lub kolejką)" },
      "trudnosc_wspinaczkowa" = { "S" = "I (Droga Jordana)" },
      "latitude"  = { "N" = "49.195139" },
      "longitude" = { "N" = "20.213056" },
      "height"    = { "N" = "2633" },
      "description_html" = { "S" = "Drugi co do wysokości szczyt Tatr. Dostępny kolejką linową." }
    }
  )
}

resource "aws_dynamodb_table_item" "lodowy_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "lodowy_szczyt" },
      "nazwa"     = { "S" = "Lodowy Szczyt (Ľadový štít)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I (Droga Kapałkowych)" },
      "latitude"  = { "N" = "49.198889" },
      "longitude" = { "N" = "20.182222" },
      "height"    = { "N" = "2627" },
      "description_html" = { "S" = "Trzeci co do wysokości szczyt Tatr, potężna piramida lodowa." }
    }
  )
}

resource "aws_dynamodb_table_item" "durny_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "durny_szczyt" },
      "nazwa"     = { "S" = "Durny Szczyt (Pyšný štít)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I / II" },
      "latitude"  = { "N" = "49.197583" },
      "longitude" = { "N" = "20.208" },
      "height"    = { "N" = "2621" },
      "description_html" = { "S" = "Uważany za jeden z najtrudniejszych do zdobycia szczytów w WKT." }
    }
  )
}

resource "aws_dynamodb_table_item" "wysoka_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "wysoka" },
      "nazwa"     = { "S" = "Wysoka (Vysoká)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I / II" },
      "latitude"  = { "N" = "49.173174" },
      "longitude" = { "N" = "20.093512" },
      "height"    = { "N" = "2547" },
      "description_html" = { "S" = "Szósty co do wysokości szczyt Słowacji, znany z pięknych widoków." }
    }
  )
}

resource "aws_dynamodb_table_item" "kiezmarski_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "kiezmarski_szczyt" },
      "nazwa"     = { "S" = "Kieżmarski Szczyt (Kežmarský štít)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "0+" },
      "latitude"  = { "N" = "49.19925" },
      "longitude" = { "N" = "20.219472" },
      "height"    = { "N" = "2558" },
      "description_html" = { "S" = "Znany z potężnej południowej ściany." }
    }
  )
}

resource "aws_dynamodb_table_item" "konczysta_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "konczysta" },
      "nazwa"     = { "S" = "Kończysta (Končistá)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I (na bloku szczytowym - 'Kowadło')" },
      "latitude"  = { "N" = "49.157306" },
      "longitude" = { "N" = "20.114083" },
      "height"    = { "N" = "2538" },
      "description_html" = { "S" = "Charakterystyczny wierzchołek z 'Kowadłem'." }
    }
  )
}

resource "aws_dynamodb_table_item" "baranie_rogi_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "baranie_rogi" },
      "nazwa"     = { "S" = "Baranie Rogi (Baranie rohy)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "0+" },
      "latitude"  = { "N" = "49.201639" },
      "longitude" = { "N" = "20.197139" },
      "height"    = { "N" = "2530" },
      "description_html" = { "S" = "Ósmy szczyt WKT, popularny cel pozaszlakowy." }
    }
  )
}

resource "aws_dynamodb_table_item" "krywan_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "krywan" },
      "nazwa"     = { "S" = "Krywań (Kriváň)" },
      "trudnosc" = { "S" = "Trudny (szlakowany)" },
      "latitude"  = { "N" = "49.162833" },
      "longitude" = { "N" = "20.000056" },
      "height"    = { "N" = "2495" },
      "description_html" = { "S" = "Narodowa góra Słowaków. Prowadzi na nią szlak turystyczny." }
    }
  )
}

resource "aws_dynamodb_table_item" "starolesny_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "starolesny_szczyt" },
      "nazwa"     = { "S" = "Staroleśny Szczyt (Bradavica)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I / II" },
      "latitude"  = { "N" = "49.171472" },
      "longitude" = { "N" = "20.155361" },
      "height"    = { "N" = "2476" },
      "description_html" = { "S" = "Strzelisty, czterowierzchołkowy szczyt." }
    }
  )
}

resource "aws_dynamodb_table_item" "ganek_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "ganek" },
      "nazwa"     = { "S" = "Ganek (Gánok)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "II / III (słynna Galeria Gankowa)" },
      "latitude"  = { "N" = "49.174333" },
      "longitude" = { "N" = "20.103861" },
      "height"    = { "N" = "2462" },
      "description_html" = { "S" = "Trójwierzchołkowy szczyt w głównej grani Tatr." }
    }
  )
}

resource "aws_dynamodb_table_item" "slawkowski_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "slawkowski_szczyt" },
      "nazwa"     = { "S" = "Sławkowski Szczyt (Slavkovský štít)" },
      "trudnosc" = { "S" = "Trudny (szlakowany)" },
      "latitude"  = { "N" = "49.166065" },
      "longitude" = { "N" = "20.184761" },
      "height"    = { "N" = "2452" },
      "description_html" = { "S" = "Jeden z najłatwiej dostępnych szczytów WKT, prowadzi na niego szlak." }
    }
  )
}

resource "aws_dynamodb_table_item" "posrednia_gran_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "posrednia_gran" },
      "nazwa"     = { "S" = "Pośrednia Grań (Prostredný hrot)" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem" },
      "trudnosc_wspinaczkowa" = { "S" = "I / II" },
      "latitude"  = { "N" = "49.184972" },
      "longitude" = { "N" = "20.194361" },
      "height"    = { "N" = "2439" },
      "description_html" = { "S" = "Najniższy szczyt WKT, ale bardzo wymagający." }
    }
  )
}

# --- Specjalna prośba: Mięguszowiecki Szczyt Wielki ---

resource "aws_dynamodb_table_item" "mieguszowiecki_wielki_peak" {
  table_name = aws_dynamodb_table.sprawdzamszlak_table.name
  hash_key   = local.sprawdzamszlak_table.hash_key
  item = jsonencode(
    {
      "id"        = { "S" = "mieguszowiecki_wielki" },
      "nazwa"     = { "S" = "Mięguszowiecki Szczyt Wielki" },
      "trudnosc" = { "S" = "Tylko z przewodnikiem / taternicko" },
      "trudnosc_wspinaczkowa" = { "S" = "I (Droga po Głazach)" },
      "latitude"  = { "N" = "49.187028" },
      "longitude" = { "N" = "20.059333" },
      "height"    = { "N" = "2438" },
      "description_html" = { "S" = "Drugi co do wysokości szczyt Polski." }
    }
  )
}