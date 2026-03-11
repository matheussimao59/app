<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

final class FinancialController
{
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Usuario nao autenticado.'], 401);
        }

        $categories = DB::table('financial_categories')
            ->where('user_id', $user->id)
            ->orderBy('type')
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'id' => (string) $row->id,
                'user_id' => (string) $row->user_id,
                'name' => $row->name,
                'kind' => $row->type,
                'color' => $row->color,
                'monthly_budget' => null,
                'active' => (bool) $row->is_active,
            ])
            ->values();

        $accounts = DB::table('financial_accounts')
            ->where('user_id', $user->id)
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'id' => (string) $row->id,
                'user_id' => (string) $row->user_id,
                'name' => $row->name,
                'bank' => null,
                'initial_balance' => (float) $row->current_balance,
                'current_balance' => (float) $row->current_balance,
                'active' => true,
            ])
            ->values();

        $transactions = DB::table('financial_transactions')
            ->where('user_id', $user->id)
            ->orderBy('due_date')
            ->limit(3000)
            ->get()
            ->map(fn ($row) => [
                'id' => (string) $row->id,
                'user_id' => (string) $row->user_id,
                'category_id' => $row->category_id ? (string) $row->category_id : null,
                'account_id' => $row->account_id ? (string) $row->account_id : null,
                'entry_type' => $row->type,
                'status' => $row->status,
                'description' => $row->title ?: ($row->description ?: ''),
                'amount' => (float) $row->amount,
                'due_date' => $row->due_date,
                'paid_date' => $row->paid_at ? date('Y-m-d', strtotime((string) $row->paid_at)) : null,
                'notes' => $row->description,
                'receipt_image_data' => null,
                'receipt_image_name' => $row->receipt_path ? basename((string) $row->receipt_path) : null,
                'invoice_image_data' => null,
                'invoice_image_name' => $row->invoice_path ? basename((string) $row->invoice_path) : null,
                'created_at' => $row->created_at,
            ])
            ->values();

        return response()->json([
            'categories' => $categories,
            'accounts' => $accounts,
            'transactions' => $transactions,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Usuario nao autenticado.'], 401);
        }

        $rows = DB::table('financial_categories')
            ->where('user_id', $user->id)
            ->orderBy('type')
            ->orderBy('name')
            ->get()
            ->map(fn ($row) => [
                'id' => (string) $row->id,
                'user_id' => (string) $row->user_id,
                'name' => $row->name,
                'kind' => $row->type,
                'color' => $row->color,
                'monthly_budget' => null,
                'active' => (bool) $row->is_active,
            ])
            ->values();

        return response()->json([
            'categories' => $rows,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Usuario nao autenticado.'], 401);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'kind' => ['required', 'in:income,expense'],
            'color' => ['nullable', 'string', 'max:20'],
            'monthly_budget' => ['nullable', 'numeric'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Dados invalidos para categoria.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $id = DB::table('financial_categories')->insertGetId([
            'user_id' => $user->id,
            'name' => $request->string('name')->toString(),
            'type' => $request->string('kind')->toString(),
            'color' => $request->input('color'),
            'icon' => null,
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Categoria criada com sucesso.',
            'category' => [
                'id' => (string) $id,
                'user_id' => (string) $user->id,
                'name' => $request->string('name')->toString(),
                'kind' => $request->string('kind')->toString(),
                'color' => $request->input('color'),
                'monthly_budget' => $request->input('monthly_budget'),
                'active' => true,
            ],
        ], 201);
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
        $id = (int) $category;
        DB::table('financial_transactions')->where('category_id', $id)->update(['category_id' => null, 'updated_at' => now()]);
        DB::table('financial_categories')->where('id', $id)->delete();

        return response()->json([
            'message' => 'Categoria excluida com sucesso.',
            'id' => $category,
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Usuario nao autenticado.'], 401);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'bank' => ['nullable', 'string', 'max:120'],
            'initial_balance' => ['nullable', 'numeric'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Dados invalidos para conta.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $balance = (float) ($request->input('initial_balance') ?? 0);
        $id = DB::table('financial_accounts')->insertGetId([
            'user_id' => $user->id,
            'name' => $request->string('name')->toString(),
            'type' => 'caixa',
            'current_balance' => $balance,
            'color' => null,
            'icon' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'message' => 'Conta criada com sucesso.',
            'account' => [
                'id' => (string) $id,
                'user_id' => (string) $user->id,
                'name' => $request->string('name')->toString(),
                'bank' => $request->input('bank'),
                'initial_balance' => $balance,
                'current_balance' => $balance,
                'active' => true,
            ],
        ], 201);
    }

    public function storeTransaction(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Usuario nao autenticado.'], 401);
        }

        $validator = Validator::make($request->all(), [
            'category_id' => ['nullable', 'integer'],
            'account_id' => ['nullable', 'integer'],
            'entry_type' => ['required', 'in:income,expense'],
            'status' => ['required', 'in:pending,paid'],
            'description' => ['required', 'string', 'max:160'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'due_date' => ['nullable', 'date'],
            'paid_date' => ['nullable', 'date'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Dados invalidos para lancamento.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $amount = (float) $request->input('amount');
        $accountId = $request->input('account_id');
        $entryType = $request->string('entry_type')->toString();
        $status = $request->string('status')->toString();

        $id = DB::table('financial_transactions')->insertGetId([
            'user_id' => $user->id,
            'account_id' => $accountId ?: null,
            'category_id' => $request->input('category_id') ?: null,
            'type' => $entryType,
            'title' => $request->string('description')->toString(),
            'description' => $request->input('notes'),
            'amount' => $amount,
            'due_date' => $request->input('due_date'),
            'paid_at' => $status === 'paid' && $request->filled('paid_date') ? $request->input('paid_date') . ' 00:00:00' : null,
            'status' => $status,
            'receipt_path' => null,
            'invoice_path' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($status === 'paid' && $accountId) {
            $account = DB::table('financial_accounts')->where('id', (int) $accountId)->where('user_id', $user->id)->first();
            if ($account) {
                $delta = $entryType === 'income' ? $amount : -$amount;
                DB::table('financial_accounts')
                    ->where('id', (int) $accountId)
                    ->update([
                        'current_balance' => ((float) $account->current_balance) + $delta,
                        'updated_at' => now(),
                    ]);
            }
        }

        return response()->json([
            'message' => 'Lancamento criado com sucesso.',
            'transaction_id' => (string) $id,
        ], 201);
    }
}
