#include <iostream>
#include <set>

int main() {
    int n;
    std::cin >> n;
    std::set<long long> values;
    for (int i = 0; i < n; i++) {
        long long x;
        std::cin >> x;
        values.insert(x);
    }
    std::cout << values.size() << '\n';
    return 0;
}
