/*
 * Rocamora_Llwelyn_BSCS4y1-1_MIDTERM_LAB_1.c
 * MIDTERM LAB 1 - Arithmetic and Logical Operations Console
 *
 * Build (MSVC):  cl /W4 /Fe:Rocamora_Llwelyn_BSCS4y1-1_MIDTERM_LAB_1.exe ^
 *                   Rocamora_Llwelyn_BSCS4y1-1_MIDTERM_LAB_1.c
 * Build (GCC) :  gcc -std=c99 -Wall -o Rocamora_Llwelyn_BSCS4y1-1_MIDTERM_LAB_1 \
 *                   Rocamora_Llwelyn_BSCS4y1-1_MIDTERM_LAB_1.c -lm
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ==================== 1. ARITHMETIC OPERATIONS ==================== */

double op_add(double a, double b)            { return a + b; }
double op_subtract(double a, double b)       { return a - b; }
double op_multiply(double a, double b)       { return a * b; }
double op_divide(double a, double b)         { return (b == 0) ? 0 : a / b; }
double op_modulo(double a, double b)         { return (b == 0) ? 0 : fmod(a, b); }
double op_power(double a, double b)          { return pow(a, b); }
double op_root(double a)                     { return sqrt(a); }
double op_absolute(double a)                 { return fabs(a); }
double op_negate(double a)                   { return -a; }
double op_increment(double a)                { return a + 1; }
double op_decrement(double a)                { return a - 1; }
double op_minimum(double a, double b)        { return (a < b) ? a : b; }
double op_maximum(double a, double b)        { return (a > b) ? a : b; }

double op_factorial(double a)
{
    double result = 1.0, i;
    if (a < 0.0 || a != floor(a)) return 0;
    for (i = 2.0; i <= a; i++) result *= i;
    return result;
}

void op_swap(double *a, double *b)
{
    double temp = *a;
    *a = *b;
    *b = temp;
}

/* ==================== 2. LOGICAL OPERATIONS ======================= */

long long op_and(long long a, long long b)        { return a & b; }
long long op_or(long long a, long long b)         { return a | b; }
long long op_xor(long long a, long long b)        { return a ^ b; }
long long op_not(long long a)                     { return ~a; }
long long op_nand(long long a, long long b)       { return ~(a & b); }
long long op_nor(long long a, long long b)        { return ~(a | b); }
long long op_xnor(long long a, long long b)       { return ~(a ^ b); }
long long op_shift_left(long long a, int n)       { return (n < 0 || n > 63) ? 0 : (a << n); }
long long op_shift_right(long long a, int n)      { return (n < 0 || n > 63) ? 0 : (a >> n); }

int op_logic_and(int a, int b)    { return (a != 0) && (b != 0); }
int op_logic_or(int a, int b)     { return (a != 0) || (b != 0); }
int op_logic_not(int a)           { return (a == 0); }

/* ==================== 3. COMPARISON OPERATIONS =================== */

int op_equal(long long a, long long b)           { return a == b; }
int op_not_equal(long long a, long long b)       { return a != b; }
int op_greater(long long a, long long b)         { return a > b; }
int op_less(long long a, long long b)            { return a < b; }
int op_greater_or_equal(long long a, long long b){ return a >= b; }
int op_less_or_equal(long long a, long long b)   { return a <= b; }

/* ==================== 4. HELPERS ================================== */

int read_int(const char *prompt)
{
    char line[256], *end;
    long long v;
    printf("%s", prompt);
    fflush(stdout);
    if (!fgets(line, sizeof line, stdin)) exit(0);
    if (!strchr(line, '\n')) { int c; while ((c = getchar()) != '\n' && c != EOF) {} }
    v = strtoll(line, &end, 10);
    while (*end == ' ' || *end == '\t') end++;
    if (end == line || (*end != '\n' && *end != '\0')) {
        printf("   >> Not a whole number. Try again.\n");
        return read_int(prompt);
    }
    return (int)v;
}

double read_double(const char *prompt)
{
    char line[256], *end;
    double v;
    printf("%s", prompt);
    fflush(stdout);
    if (!fgets(line, sizeof line, stdin)) exit(0);
    if (!strchr(line, '\n')) { int c; while ((c = getchar()) != '\n' && c != EOF) {} }
    v = strtod(line, &end);
    while (*end == ' ' || *end == '\t') end++;
    if (end == line || (*end != '\n' && *end != '\0')) {
        printf("   >> Not a number. Try again.\n");
        return read_double(prompt);
    }
    return v;
}

long long read_long_long(const char *prompt)
{
    char line[256], *end;
    long long v;
    printf("%s", prompt);
    fflush(stdout);
    if (!fgets(line, sizeof line, stdin)) exit(0);
    if (!strchr(line, '\n')) { int c; while ((c = getchar()) != '\n' && c != EOF) {} }
    v = strtoll(line, &end, 10);
    while (*end == ' ' || *end == '\t') end++;
    if (end == line || (*end != '\n' && *end != '\0')) {
        printf("   >> Not a whole number. Try again.\n");
        return read_long_long(prompt);
    }
    return v;
}

void show_number(double v)     { printf("   Result : %.6f\n", v); }
void show_bool(int b)          { printf("   Result : %s\n", b ? "TRUE" : "FALSE"); }

void show_bits(long long v)
{
    int i;
    printf("   Binary : ");
    for (i = 63; i >= 0; i--) {
        putchar(((unsigned long long)v >> i) & 1ULL ? '1' : '0');
        if (i > 0 && i % 8 == 0) putchar(' ');
    }
    printf("\n");
}

void show_logic(long long v)
{
    printf("   Result : %lld\n", v);
    printf("   Hex    : %llX\n", (unsigned long long)v);
    show_bits(v);
}

void header(void)
{
    printf("\n============================================================\n");
    printf("   ROCAMORA_LLWELYN_BSCS4y1-1  |  MIDTERM LAB 1\n");
    printf("   Arithmetic and Logical Operations Console\n");
    printf("============================================================\n");
}

/* ==================== 5. ARITHMETIC MENU ========================= */

void arithmetic_menu(void)
{
    int choice;
    double a, b;

    printf("\n--- ARITHMETIC OPERATIONS ---\n");
    printf("  1) Addition          2) Subtraction     3) Multiplication\n");
    printf("  4) Division          5) Modulo          6) Power\n");
    printf("  7) Square Root       8) Absolute Value  9) Negation\n");
    printf(" 10) Increment        11) Decrement      12) Factorial\n");
    printf(" 13) Minimum          14) Maximum        15) Swap\n");
    printf("  0) Back\n");

    choice = read_int("\nEnter choice: ");
    if (choice == 0) return;

    if (choice == 7 || choice == 8 || choice == 9 || choice == 10 ||
        choice == 11 || choice == 12) {
        a = read_double("Enter number : ");
        switch (choice) {
            case 7:  if (a < 0) { printf("   Error : square root of a negative number.\n"); return; }
                     show_number(op_root(a)); break;
            case 8:  show_number(op_absolute(a)); break;
            case 9:  show_number(op_negate(a)); break;
            case 10: show_number(op_increment(a)); break;
            case 11: show_number(op_decrement(a)); break;
            case 12: if (a < 0 || a != floor(a)) { printf("   Error : factorial needs a non-negative whole number.\n"); return; }
                     show_number(op_factorial(a)); break;
        }
        return;
    }

    a = read_double("Enter first number  : ");
    b = read_double("Enter second number : ");

    switch (choice) {
        case 1:  show_number(op_add(a, b)); break;
        case 2:  show_number(op_subtract(a, b)); break;
        case 3:  show_number(op_multiply(a, b)); break;
        case 4:  if (b == 0) { printf("   Error : division by zero.\n"); break; }
                 show_number(op_divide(a, b)); break;
        case 5:  if (b == 0) { printf("   Error : modulo by zero.\n"); break; }
                 show_number(op_modulo(a, b)); break;
        case 6:  show_number(op_power(a, b)); break;
        case 13: show_number(op_minimum(a, b)); break;
        case 14: show_number(op_maximum(a, b)); break;
        case 15: op_swap(&a, &b);
                 printf("   After swap : first = %.6f , second = %.6f\n", a, b); break;
        default: printf("   Invalid choice.\n");
    }
}

/* ==================== 6. LOGICAL MENU ============================ */

void logical_menu(void)
{
    int choice;
    long long a, b;

    printf("\n--- LOGICAL (BITWISE) OPERATIONS ---\n");
    printf("  1) AND    2) OR     3) XOR    4) NOT\n");
    printf("  5) NAND   6) NOR    7) XNOR\n");
    printf("  8) Shift Left      9) Shift Right\n");
    printf(" 10) Boolean AND   11) Boolean OR   12) Boolean NOT\n");
    printf("  0) Back\n");

    choice = read_int("\nEnter choice: ");
    if (choice == 0) return;

    if (choice == 4 || choice == 12) {
        a = read_long_long("Enter a whole number : ");
        if (choice == 4)      show_logic(op_not(a));
        else                  show_bool(op_logic_not(a != 0));
        return;
    }

    a = read_long_long("Enter first whole number  : ");
    b = read_long_long("Enter second whole number : ");

    switch (choice) {
        case 1:  show_logic(op_and(a, b)); break;
        case 2:  show_logic(op_or(a, b)); break;
        case 3:  show_logic(op_xor(a, b)); break;
        case 5:  show_logic(op_nand(a, b)); break;
        case 6:  show_logic(op_nor(a, b)); break;
        case 7:  show_logic(op_xnor(a, b)); break;
        case 8:  show_logic(op_shift_left(a, (int)b)); break;
        case 9:  show_logic(op_shift_right(a, (int)b)); break;
        case 10: show_bool(op_logic_and(a != 0, b != 0)); break;
        case 11: show_bool(op_logic_or(a != 0, b != 0)); break;
        default: printf("   Invalid choice.\n");
    }
}

/* ==================== 7. COMPARISON MENU ========================= */

void comparison_menu(void)
{
    int choice;
    long long a, b;

    printf("\n--- COMPARISON OPERATIONS ---\n");
    printf("  1) Equal            2) Not Equal\n");
    printf("  3) Greater Than     4) Less Than\n");
    printf("  5) Greater Or Equal 6) Less Or Equal\n");
    printf("  0) Back\n");

    choice = read_int("\nEnter choice: ");
    if (choice == 0) return;

    a = read_long_long("Enter first whole number  : ");
    b = read_long_long("Enter second whole number : ");

    switch (choice) {
        case 1: show_bool(op_equal(a, b)); break;
        case 2: show_bool(op_not_equal(a, b)); break;
        case 3: show_bool(op_greater(a, b)); break;
        case 4: show_bool(op_less(a, b)); break;
        case 5: show_bool(op_greater_or_equal(a, b)); break;
        case 6: show_bool(op_less_or_equal(a, b)); break;
        default: printf("   Invalid choice.\n");
    }
}

/* ==================== 8. MAIN ==================================== */

int main(void)
{
    int choice;

    header();
    printf("\n  Operations Library: arithmetic, logical/bitwise, comparison\n");

    for (;;) {
        printf("\n============================================================\n");
        printf("  MAIN MENU\n");
        printf("============================================================\n");
        printf("  1) Arithmetic Operations\n");
        printf("  2) Logical Operations\n");
        printf("  3) Comparison Operations\n");
        printf("  0) Exit\n");

        choice = read_int("\nEnter choice: ");

        if (choice == 1)      arithmetic_menu();
        else if (choice == 2) logical_menu();
        else if (choice == 3) comparison_menu();
        else if (choice == 0) { printf("\nGoodbye.\n"); break; }
        else printf("   Invalid choice.\n");

        if (choice != 0) {
            printf("\nPress ENTER to return to main menu...");
            fflush(stdout);
            getchar();
        }
    }
    return 0;
}