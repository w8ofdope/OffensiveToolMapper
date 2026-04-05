project_root <- normalizePath(getwd(), winslash = "/", mustWork = TRUE)

if (!file.exists(file.path(project_root, "OffensiveToolMapper.Rproj"))) {
  candidate <- normalizePath(file.path(project_root, ".."), winslash = "/", mustWork = FALSE)
  if (file.exists(file.path(candidate, "OffensiveToolMapper.Rproj"))) {
    project_root <- candidate
  } else {
    stop("Could not locate OffensiveToolMapper.Rproj from the current working directory.", call. = FALSE)
  }
}

source(file.path(project_root, "R", "utils_core.R"))
source(file.path(project_root, "R", "webapp_export.R"))

webapp_data_dir <- file.path(project_root, "webapp", "public", "data")
dir.create(webapp_data_dir, recursive = TRUE, showWarnings = FALSE)

export_result <- export_webapp_data(
  data_dir = file.path(project_root, "inst", "extdata"),
  webapp_data_dir = webapp_data_dir
)

cat(sprintf(
  "Exported %s tools, %s matrix rows, and %s refinement candidates to %s\n",
  length(export_result$tools),
  length(export_result$matrix),
  length(export_result$refinement),
  webapp_data_dir
))
