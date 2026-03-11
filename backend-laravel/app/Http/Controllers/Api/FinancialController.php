<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class FinancialController
{
    public function dashboard(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar dashboard financeiro.',
            'user_id' => $request->user()?->id,
        ], 501);
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar listagem de categorias financeiras.',
            'user_id' => $request->user()?->id,
        ], 501);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar criacao de categoria financeira.',
            'payload' => $request->all(),
        ], 501);
    }

    public function show(string $category): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar detalhe da categoria financeira.',
            'id' => $category,
        ], 501);
    }

    public function update(Request $request, string $category): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar atualizacao da categoria financeira.',
            'id' => $category,
            'payload' => $request->all(),
        ], 501);
    }

    public function destroy(string $category): JsonResponse
    {
        return response()->json([
            'message' => 'Implementar exclusao da categoria financeira.',
            'id' => $category,
        ], 501);
    }
}
