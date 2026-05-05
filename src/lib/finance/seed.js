/**
 * Default categories and wallets created the first time a user opens the app.
 */

export function defaultCategories() {
  return [
    // Expense
    { name: "Їжа", kind: "expense", icon: "🍔", color: "#F97316", sortOrder: 1 },
    { name: "Житло", kind: "expense", icon: "🏠", color: "#0EA5E9", sortOrder: 2 },
    { name: "Транспорт", kind: "expense", icon: "🚗", color: "#6366F1", sortOrder: 3 },
    { name: "Одяг", kind: "expense", icon: "👕", color: "#EC4899", sortOrder: 4 },
    { name: "Здоров'я", kind: "expense", icon: "💊", color: "#EF4444", sortOrder: 5 },
    { name: "Розваги", kind: "expense", icon: "🎬", color: "#8B5CF6", sortOrder: 6 },
    { name: "Освіта", kind: "expense", icon: "📚", color: "#0891B2", sortOrder: 7 },
    { name: "Подорожі", kind: "expense", icon: "✈️", color: "#14B8A6", sortOrder: 8 },
    { name: "Подарунки", kind: "expense", icon: "🎁", color: "#F59E0B", sortOrder: 9 },
    { name: "Робочі", kind: "expense", icon: "💼", color: "#64748B", sortOrder: 10 },
    { name: "Тварини", kind: "expense", icon: "🐾", color: "#A16207", sortOrder: 11 },
    { name: "Підписки", kind: "expense", icon: "📱", color: "#7C3AED", sortOrder: 12 },
    { name: "Комісії", kind: "expense", icon: "🏦", color: "#475569", sortOrder: 13 },
    { name: "Інше", kind: "expense", icon: "❓", color: "#94A3B8", sortOrder: 99 },
    // Income
    { name: "Зарплата", kind: "income", icon: "💼", color: "#10B981", sortOrder: 1 },
    { name: "Фріланс", kind: "income", icon: "💻", color: "#06B6D4", sortOrder: 2 },
    { name: "Подарунки", kind: "income", icon: "🎁", color: "#F59E0B", sortOrder: 3 },
    { name: "Інвестиції", kind: "income", icon: "📈", color: "#84CC16", sortOrder: 4 },
    { name: "Повернення", kind: "income", icon: "🔄", color: "#0EA5E9", sortOrder: 5 },
    { name: "Інше", kind: "income", icon: "❓", color: "#94A3B8", sortOrder: 99 },
  ];
}

export function defaultWallets() {
  return [
    { name: "Готівка", type: "cash", currency: "UAH", balance_cents: 0, icon: "💵", color: "#10B981", sortOrder: 1, isArchived: false },
    { name: "Картка", type: "card", currency: "UAH", balance_cents: 0, icon: "💳", color: "#6366F1", sortOrder: 2, isArchived: false },
    { name: "Заощадження", type: "savings", currency: "UAH", balance_cents: 0, icon: "💰", color: "#F59E0B", sortOrder: 3, isArchived: false },
  ];
}
