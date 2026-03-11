<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CoverAgendaController;
use App\Http\Controllers\Api\FinancialController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\ShippingOrderController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/financial/dashboard', [FinancialController::class, 'dashboard']);
    Route::apiResource('financial/categories', FinancialController::class)->parameter('categories', 'category');

    Route::get('/shipping/orders', [ShippingOrderController::class, 'index']);
    Route::post('/shipping/orders/import', [ShippingOrderController::class, 'import']);
    Route::get('/shipping/orders/scan', [ShippingOrderController::class, 'scan']);
    Route::delete('/shipping/orders/by-date', [ShippingOrderController::class, 'destroyByDate']);

    Route::apiResource('cover-agenda', CoverAgendaController::class);
    Route::patch('/cover-agenda/{cover}/printed', [CoverAgendaController::class, 'markPrinted']);
});
