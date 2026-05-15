.webapp_normalize_scalar <- function(value) {
  if (length(value) == 0) {
    return(NULL)
  }

  if (inherits(value, "Date") || inherits(value, "POSIXt")) {
    return(as.character(value))
  }

  if (is.factor(value)) {
    return(as.character(value))
  }

  if (length(value) == 1 && is.na(value)) {
    return(NULL)
  }

  value
}

.webapp_row_to_list <- function(df_row) {
  row <- as.list(df_row)
  lapply(row, function(column) .webapp_normalize_scalar(column[[1]]))
}

.webapp_rows_to_named_list <- function(df, key_name) {
  if (nrow(df) == 0) {
    return(list())
  }

  split_df <- unname(split(df, seq_len(nrow(df))))
  lapply(split_df, function(row) {
    result <- list(count = row$count[[1]])
    result[[key_name]] <- row[[key_name]][[1]]
    result[c(key_name, "count")]
  })
}

.webapp_rows_to_records <- function(df) {
  if (nrow(df) == 0) {
    return(list())
  }

  split_df <- unname(split(df, seq_len(nrow(df))))
  lapply(split_df, .webapp_row_to_list)
}

.webapp_count_records <- function(data, columns, sort_by_count = TRUE) {
  if (!is.data.frame(data) || nrow(data) == 0) {
    result <- as.data.frame(setNames(vector("list", length(columns) + 1L), c(columns, "count")), stringsAsFactors = FALSE)
    for (column in columns) {
      result[[column]] <- character()
    }
    result[["count"]] <- integer()
    return(tibble::as_tibble(result))
  }

  counted <- data |>
    dplyr::select(dplyr::all_of(columns)) |>
    dplyr::mutate(dplyr::across(dplyr::everything(), function(value) {
      if (is.factor(value)) {
        return(as.character(value))
      }

      value
    })) |>
    dplyr::count(dplyr::across(dplyr::everything()), name = "count") |>
    tibble::as_tibble()

  if (isTRUE(sort_by_count) && nrow(counted) > 0) {
    order_args <- c(list(-counted[["count"]]), unname(lapply(columns, function(column) counted[[column]])))
    counted <- counted[do.call(order, order_args), , drop = FALSE]
  }

  tibble::as_tibble(counted)
}

.webapp_collapse_vector <- function(value) {
  if (is.null(value) || length(value) == 0 || all(is.na(value))) {
    return(NA_character_)
  }

  paste(as.character(unlist(value, use.names = FALSE)), collapse = ", ")
}

.webapp_empty_tools <- function() {
  tibble::tibble(
    record_id = character(),
    assessed_name = character(),
    source = character(),
    source_type = character(),
    url = character(),
    date_found = character(),
    entity_type = character(),
    category_ru = character(),
    short_description_ru = character(),
    long_description_ru = character(),
    summary_ru = character(),
    purpose_ru = character(),
    capabilities_ru = list(),
    reason_ru = character(),
    pre_llm_score = numeric(),
    pre_llm_priority = character(),
    confidence_score = numeric(),
    detail_score = numeric(),
    mitre_score = numeric(),
    entity_priority_score = numeric(),
    visualization_score = numeric(),
    overall_confidence = numeric(),
    llm_provider = character(),
    llm_model = character(),
    mitre_tactics = list(),
    mitre_technique_ids = list(),
    mitre_technique_names = list(),
    mitre_tactic_count = integer(),
    mitre_technique_count = integer(),
    filter_tags = list(),
    visualization_rank = integer(),
    mitre_matrix = list(),
    first_ui_added_at = character(),
    last_ui_seen_at = character()
  )
}

.webapp_empty_matrix <- function() {
  tibble::tibble(
    record_id = character(),
    assessed_name = character(),
    source = character(),
    url = character(),
    entity_type = character(),
    category_ru = character(),
    technique_id = character(),
    technique_name = character(),
    tactic = character(),
    confidence = numeric(),
    reasoning_ru = character(),
    tactic_tag = character(),
    technique_tag = character()
  )
}

#' Export visualization artifacts to JSON for the React webapp
#'
#' @param tools Optional visualization tools data frame.
#' @param matrix Optional visualization matrix data frame.
#' @param refinement Optional MITRE refinement candidates data frame.
#' @param data_dir Directory containing the visualization RDS artifacts.
#' @param webapp_data_dir Output directory for JSON files.
#'
#' @return Named list with exported summary, tools, matrix, and refinement payloads.
export_webapp_data <- function(
  tools = NULL,
  matrix = NULL,
  refinement = NULL,
  data_dir = get_default_data_dir(),
  webapp_data_dir = file.path(getwd(), "webapp", "public", "data")
) {
  visualization_tools <- tools
  visualization_matrix <- matrix
  refinement_candidates <- refinement
  refinement_summary_view <- data.frame(stringsAsFactors = FALSE)

  if (is.null(visualization_tools)) {
    visualization_tools <- load_pipeline_rds(file.path(data_dir, "visualization_tools.rds"), required = FALSE)
    if (is.null(visualization_tools)) {
      visualization_tools <- .webapp_empty_tools()
      log_message(sprintf("Visualization tools artifact is absent in %s; exporting an empty webapp dataset.", data_dir), level = "WARN")
    }
  }

  if (is.null(visualization_matrix)) {
    visualization_matrix <- load_pipeline_rds(file.path(data_dir, "visualization_tool_matrix.rds"), required = FALSE)
    if (is.null(visualization_matrix)) {
      visualization_matrix <- .webapp_empty_matrix()
      log_message(sprintf("Visualization matrix artifact is absent in %s; exporting an empty MITRE matrix.", data_dir), level = "WARN")
    }
  }

  if (is.null(refinement_candidates)) {
    refinement_path <- file.path(data_dir, "mitre_refinement_candidates.rds")
    refinement_candidates <- if (file.exists(refinement_path)) {
      load_pipeline_rds(refinement_path, required = FALSE)
    } else {
      NULL
    }
  }

  if (is.null(refinement_candidates)) {
    refinement_candidates <- data.frame(stringsAsFactors = FALSE)
  }

  if (!is.data.frame(refinement_candidates)) {
    refinement_candidates <- as.data.frame(refinement_candidates, stringsAsFactors = FALSE)
  }

  if (nrow(refinement_candidates) > 0) {
    refinement_candidates[["record_id"]] <- as.character(refinement_candidates[["record_id"]])
    refinement_candidates[["assessed_name"]] <- as.character(refinement_candidates[["assessed_name"]])
    refinement_candidates[["technique_id"]] <- as.character(refinement_candidates[["technique_id"]])
    refinement_candidates[["technique_name"]] <- as.character(refinement_candidates[["technique_name"]])
    refinement_candidates[["already_mapped"]] <- dplyr::coalesce(as.logical(refinement_candidates[["already_mapped"]]), FALSE)
    refinement_candidates[["retrieval_score"]] <- as.numeric(refinement_candidates[["retrieval_score"]])
    refinement_candidates[["retrieval_rank"]] <- as.integer(refinement_candidates[["retrieval_rank"]])
    refinement_candidates[["mapped_confidence"]] <- as.numeric(refinement_candidates[["mapped_confidence"]])
    refinement_candidates <- tibble::as_tibble(refinement_candidates)

    refinement_summary_view <- refinement_candidates
    refinement_summary_view[["tactic_names"]] <- vapply(refinement_summary_view[["tactic_names"]], .webapp_collapse_vector, character(1))
    refinement_summary_view[["matched_terms"]] <- vapply(refinement_summary_view[["matched_terms"]], .webapp_collapse_vector, character(1))
  } else {
    refinement_summary_view <- refinement_candidates
  }

  ensure_dir(webapp_data_dir)

  tools_json <- lapply(seq_len(nrow(visualization_tools)), function(index) {
    .webapp_row_to_list(visualization_tools[index, , drop = FALSE])
  })
  matrix_json <- lapply(seq_len(nrow(visualization_matrix)), function(index) {
    .webapp_row_to_list(visualization_matrix[index, , drop = FALSE])
  })
  refinement_json <- .webapp_rows_to_records(refinement_candidates)

  refinement_summary <- list(
    candidate_count = nrow(refinement_candidates),
    gap_count = if (nrow(refinement_candidates) > 0) sum(!refinement_candidates$already_mapped, na.rm = TRUE) else 0,
    mapped_count = if (nrow(refinement_candidates) > 0) sum(refinement_candidates$already_mapped, na.rm = TRUE) else 0,
    tool_count = if (nrow(refinement_candidates) > 0) dplyr::n_distinct(refinement_candidates$record_id) else 0,
    technique_count = if (nrow(refinement_candidates) > 0) dplyr::n_distinct(refinement_candidates$technique_id) else 0
  )

  summary_json <- list(
    generated_at = format(Sys.time(), tz = "UTC", usetz = TRUE),
    tool_count = nrow(visualization_tools),
    matrix_count = nrow(visualization_matrix),
    refinement_summary = refinement_summary,
    source_breakdown = .webapp_count_records(visualization_tools, "source") |>
      .webapp_rows_to_named_list("source"),
    entity_breakdown = .webapp_count_records(visualization_tools, "entity_type") |>
      .webapp_rows_to_named_list("entity_type"),
    tactic_breakdown = .webapp_count_records(visualization_matrix, "tactic") |>
      .webapp_rows_to_named_list("tactic"),
    top_tools = {
      top_tools <- visualization_tools
      if (nrow(top_tools) > 0) {
        top_tools <- top_tools[order(top_tools[["visualization_rank"]]), , drop = FALSE]
        top_tools <- utils::head(top_tools, 8L)
        top_tools <- top_tools[c(
          "assessed_name",
          "short_description_ru",
          "visualization_rank",
          "visualization_score",
          "confidence_score",
          "source",
          "entity_type",
          "mitre_technique_count"
        )]
      }
      .webapp_rows_to_records(top_tools)
    },
    top_refinement_techniques = if (nrow(refinement_candidates) > 0) {
      refinement_techniques <- refinement_summary_view[!refinement_summary_view[["already_mapped"]], , drop = FALSE]
      refinement_techniques <- .webapp_count_records(refinement_techniques, c("technique_id", "technique_name", "tactic_names"))
      refinement_techniques <- utils::head(refinement_techniques, 8L)
      .webapp_rows_to_records(refinement_techniques)
    } else {
      list()
    },
    top_refinement_tools = if (nrow(refinement_candidates) > 0) {
      refinement_tools <- refinement_summary_view[!refinement_summary_view[["already_mapped"]], , drop = FALSE]
      refinement_tools <- .webapp_count_records(refinement_tools, c("record_id", "assessed_name"))
      refinement_tools <- utils::head(refinement_tools, 8L)
      .webapp_rows_to_records(refinement_tools)
    } else {
      list()
    }
  )

  jsonlite::write_json(summary_json, file.path(webapp_data_dir, "summary.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")
  jsonlite::write_json(tools_json, file.path(webapp_data_dir, "tools.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")
  jsonlite::write_json(matrix_json, file.path(webapp_data_dir, "matrix.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")
  jsonlite::write_json(refinement_json, file.path(webapp_data_dir, "refinement.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")

  log_message(sprintf(
    "Exported %s tools, %s matrix rows, and %s refinement candidates to %s",
    nrow(visualization_tools),
    nrow(visualization_matrix),
    nrow(refinement_candidates),
    webapp_data_dir
  ))

  list(
    summary = summary_json,
    tools = tools_json,
    matrix = matrix_json,
    refinement = refinement_json
  )
}
