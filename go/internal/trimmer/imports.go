package trimmer

import (
	"context"
	"path/filepath"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/golang"
	"github.com/smacker/go-tree-sitter/javascript"
	"github.com/smacker/go-tree-sitter/python"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
)

// ImportGraph maps file paths to the files they import.
type ImportGraph map[string][]string

// BuildImportGraph analyzes all files and returns their import relationships.
func BuildImportGraph(files []CodeFile) ImportGraph {
	graph := make(ImportGraph)
	for _, f := range files {
		imports := extractImports(f)
		if len(imports) > 0 {
			graph[f.Path] = imports
		}
	}
	return graph
}

func extractImports(file CodeFile) []string {
	lang := detectLanguage(file)
	if lang == nil {
		return nil
	}

	parser := sitter.NewParser()
	parser.SetLanguage(lang)

	tree, err := parser.ParseCtx(context.Background(), nil, []byte(file.Content))
	if err != nil || tree == nil {
		return nil
	}

	switch strings.ToLower(file.Language) {
	case "go", "":
		if filepath.Ext(file.Path) == ".go" {
			return extractGoImports(tree, file.Content)
		}
	case "python", "py":
		return extractPythonImports(tree, file.Content)
	case "typescript", "ts":
		return extractJSImports(tree, file.Content)
	case "javascript", "js":
		return extractJSImports(tree, file.Content)
	}

	switch filepath.Ext(file.Path) {
	case ".go":
		return extractGoImports(tree, file.Content)
	case ".py":
		return extractPythonImports(tree, file.Content)
	case ".ts":
		return extractJSImports(tree, file.Content)
	case ".js":
		return extractJSImports(tree, file.Content)
	}
	return nil
}

func detectLanguage(file CodeFile) *sitter.Language {
	switch strings.ToLower(file.Language) {
	case "go":
		return golang.GetLanguage()
	case "python", "py":
		return python.GetLanguage()
	case "typescript", "ts":
		return typescript.GetLanguage()
	case "javascript", "js":
		return javascript.GetLanguage()
	}

	switch filepath.Ext(file.Path) {
	case ".go":
		return golang.GetLanguage()
	case ".py":
		return python.GetLanguage()
	case ".ts":
		return typescript.GetLanguage()
	case ".js":
		return javascript.GetLanguage()
	}
	return nil
}

func extractGoImports(tree *sitter.Tree, content string) []string {
	var imports []string
	src := []byte(content)

	var walk func(node *sitter.Node)
	walk = func(node *sitter.Node) {
		if node.Type() == "interpreted_string_literal" {
			parent := node.Parent()
			if parent != nil && parent.Type() == "import_spec" {
				path := strings.Trim(string(node.Content(src)), `"`)
				if strings.HasPrefix(path, "./") || strings.HasPrefix(path, "../") {
					imports = append(imports, path)
				}
			}
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			walk(node.Child(i))
		}
	}
	walk(tree.RootNode())
	return imports
}

func extractPythonImports(tree *sitter.Tree, content string) []string {
	var imports []string
	src := []byte(content)

	var walk func(node *sitter.Node)
	walk = func(node *sitter.Node) {
		if node.Type() == "relative_import" {
			imports = append(imports, string(node.Content(src)))
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			walk(node.Child(i))
		}
	}
	walk(tree.RootNode())
	return imports
}

func extractJSImports(tree *sitter.Tree, content string) []string {
	var imports []string
	src := []byte(content)

	var walk func(node *sitter.Node)
	walk = func(node *sitter.Node) {
		if node.Type() == "import_statement" {
			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.Type() == "string" {
					path := strings.Trim(string(child.Content(src)), `"'`)
					if strings.HasPrefix(path, ".") {
						imports = append(imports, path)
					}
				}
			}
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			walk(node.Child(i))
		}
	}
	walk(tree.RootNode())
	return imports
}

// ImportBoost returns a boost score for files imported by top-scored files.
func ImportBoost(graph ImportGraph, scores map[string]float64) map[string]float64 {
	boosts := make(map[string]float64)
	const boostFactor = 0.3

	for importer, imported := range graph {
		importerScore := scores[importer]
		if importerScore <= 0 {
			continue
		}
		for _, dep := range imported {
			boosts[dep] += importerScore * boostFactor
		}
	}
	return boosts
}
