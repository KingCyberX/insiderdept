"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import authService from "../../services/authService";
import AuthModal from "../auth/AuthModal";

const Header: React.FC = () => {
  const pathname = usePathname();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    displayName: string;
  } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const unsubscribe = authService.subscribe((state) => {
      setIsAuthenticated(state.isAuthenticated);
      setUser(state.user);
    });
    return unsubscribe;
  }, []);

  const handleLogout = () => {
    authService.logout();
    setShowUserMenu(false);
  };

  return (
    <header>
      <style jsx>{`
        .navbar {
          background-color: #161a23;
          border-bottom: 1px solid #2a2e39;
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: sans-serif;
        }
        .left-group {
          display: flex;
          align-items: center;
          gap: 32px;
        }
        .logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          user-select: none;
          cursor: default;
        }
        .nav-links {
          display: flex;
          gap: 32px;
        }
        .nav-links a {
          font-size: 1rem;
          color: #afb5c4;
          text-decoration: none;
          padding-bottom: 6px;
          transition: color 0.3s ease;
          cursor: pointer;
        }
        .nav-links a.active {
          color: white;
          border-bottom: 3px solid white;
        }
        .nav-links a:hover {
          color: white;
        }
        .right-group {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .search-wrapper {
          position: relative;
        }
        .search-input {
          background-color: #1e222d;
          color: white;
          font-size: 1rem;
          padding: 10px 20px 10px 14px;
          border-radius: 8px;
          border: none;
          outline: none;
          width: 280px;
          box-sizing: border-box;
        }
        .search-input:focus {
          outline: none;
          box-shadow: 0 0 0 2px #3b82f6;
        }
        .search-icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          stroke: #afb5c4;
          pointer-events: none;
        }
        .bell-icon {
          width: 24px;
          height: 24px;
          stroke: #afb5c4;
          cursor: pointer;
        }
        .btn-register,
        .btn-login {
          padding: 10px 20px;
          font-size: 1rem;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-register {
          border: 1px solid #2a2e39;
          background-color: transparent;
          color: white;
        }
        .btn-register:hover {
          background-color: #1e222d;
        }
        .btn-login {
          background-color: #1e222d;
          color: white;
          border: none;
        }
        .btn-login:hover {
          background-color: #262b3c;
        }
      `}</style>

      <div className="navbar">
        <div className="left-group">
          <span className="logo">
            <svg
              width="159"
              height="55"
              viewBox="0 0 159 55"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.062 19.3098H13.9674V36.2173H17.062V19.3098Z"
                fill="white"
              />
              <path
                d="M24.7868 24.0542C23.0752 24.0542 21.6243 24.6587 20.4316 25.8668C19.239 27.0748 18.6433 28.5526 18.6433 30.2991V36.2173H21.7379V30.3037C21.7379 29.4464 22.0374 28.7177 22.6354 28.1188C23.2334 27.5199 23.955 27.2182 24.7979 27.2182C25.6409 27.2182 26.3391 27.5222 26.9371 28.1302C27.5351 28.7382 27.8346 29.4623 27.8346 30.3037V36.2173H30.9292V30.2991C30.9292 28.5526 30.3334 27.0748 29.1408 25.8668C27.9482 24.6587 26.4972 24.0542 24.7857 24.0542H24.7868Z"
                fill="white"
              />
              <path
                d="M38.929 28.934C37.9814 28.7461 37.4769 28.6448 37.4157 28.6289C36.6206 28.4103 36.2242 28.1438 36.2242 27.8307V27.7841C36.2242 27.126 36.713 26.7969 37.6908 26.7969C38.3177 26.7969 38.8979 27.0782 39.4324 27.6406L41.4947 25.7426C41.0971 25.2121 40.4245 24.7817 39.478 24.4538C38.6529 24.1726 37.8578 24.0405 37.0939 24.0553C36.36 24.0713 35.6797 24.2432 35.0538 24.5711C33.6329 25.3054 32.9225 26.4076 32.9225 27.8752C32.9225 29.3427 33.6173 30.4767 35.0082 31.0859C35.4814 31.2885 36.0627 31.4604 36.7498 31.6016C37.2999 31.7109 37.6585 31.7815 37.8266 31.8123C38.2542 31.9682 38.4914 32.2267 38.5371 32.5853V32.6787C38.5371 33.0225 38.3388 33.2878 37.9413 33.4757C37.6351 33.6157 37.2921 33.6863 36.9101 33.6863H36.8411C35.9091 33.6863 35.0305 33.2878 34.2053 32.4908L32.486 34.7645C33.0205 35.2336 33.712 35.6241 34.5605 35.9361C35.4091 36.2481 36.1919 36.4131 36.9101 36.428C38.713 36.4746 40.1038 35.8871 41.0816 34.6655C41.5704 34.0552 41.8154 33.3732 41.8154 32.6218V32.5512C41.8154 30.5155 40.8533 29.3097 38.9279 28.9329L38.929 28.934Z"
                fill="white"
              />
              <path
                d="M44.9579 19.484C44.4378 19.484 43.9991 19.6639 43.6405 20.0226C43.2808 20.3823 43.1015 20.8275 43.1015 21.3581C43.1015 21.8886 43.2808 22.3384 43.6405 22.7061C43.9991 23.0739 44.4389 23.2572 44.9579 23.2572C45.4768 23.2572 45.9122 23.0739 46.2641 22.7061C46.6159 22.3395 46.7908 21.8898 46.7908 21.3581C46.7908 20.8264 46.6115 20.4017 46.2518 20.0339C45.8921 19.6673 45.4612 19.4829 44.9567 19.4829L44.9579 19.484Z"
                fill="white"
              />
              <path
                d="M46.5168 24.0542H43.4222V36.2173H46.5168V24.0542Z"
                fill="white"
              />
              <path
                d="M57.2672 30.3003C57.2672 31.1553 56.9732 31.8885 56.383 32.4954C55.7962 33.1022 55.0812 33.4051 54.2394 33.4051C53.3975 33.4051 52.6826 33.1022 52.0858 32.4954C51.4889 31.8885 51.1927 31.1553 51.1927 30.3003C51.1927 29.4452 51.4889 28.7154 52.0858 28.1177C52.6826 27.5176 53.3998 27.2171 54.2394 27.2171C54.9253 27.2171 55.5311 27.4254 56.0578 27.8433V24.3274C55.4777 24.1453 54.8708 24.053 54.2394 24.053C52.529 24.053 51.078 24.6565 49.8843 25.8667C48.6939 27.0736 48.0981 28.5515 48.0981 30.2991C48.0981 32.0468 48.6883 33.5474 49.8753 34.7543C51.0591 35.9646 52.5134 36.568 54.2394 36.568C55.9654 36.568 57.4008 35.9577 58.5845 34.7418C59.7682 33.5246 60.3618 32.0445 60.3618 30.2957V19.3098H57.2672V30.2991V30.3003Z"
                fill="white"
              />
              <path
                d="M68.0854 24.0542C66.3739 24.0542 64.9229 24.6587 63.7303 25.8667C62.5377 27.0747 61.9419 28.5526 61.9419 30.2991C61.9419 32.0457 62.5343 33.5474 63.718 34.7554C64.9018 35.9634 66.3572 36.568 68.0843 36.568C69.7045 36.568 71.1021 35.9976 72.2791 34.8567L70.3994 32.3018C69.7881 33.0362 69.0164 33.4028 68.0843 33.4028C67.4117 33.4028 66.8082 33.2036 66.2737 32.8051C65.738 32.4066 65.3717 31.8794 65.1735 31.2225H74.1354C74.1811 30.9117 74.2045 30.5997 74.2045 30.2877C74.2045 28.5435 73.612 27.0679 72.4283 25.8611C71.2435 24.6542 69.7959 24.0508 68.0843 24.0508L68.0854 24.0542ZM65.404 28.8577C65.9697 27.7647 66.8627 27.2171 68.0854 27.2171C69.3081 27.2171 70.1789 27.7636 70.7446 28.8577H65.404Z"
                fill="white"
              />
              <path
                d="M92.6584 30.3003C92.6584 31.1553 92.3622 31.8885 91.7742 32.4954C91.1841 33.1022 90.4691 33.4051 89.6306 33.4051C88.7921 33.4051 88.0705 33.1022 87.477 32.4954C86.8801 31.8885 86.5806 31.1553 86.5806 30.3003C86.5806 29.4452 86.8801 28.7154 87.477 28.1177C88.0705 27.5176 88.791 27.2171 89.6306 27.2171C90.3166 27.2171 90.9224 27.4254 91.4491 27.8433V24.3274C90.8689 24.1453 90.262 24.053 89.6306 24.053C87.9202 24.053 86.4692 24.6565 85.2766 25.8667C84.084 27.0736 83.4871 28.5515 83.4871 30.2991C83.4871 32.0468 84.0806 33.5474 85.2644 34.7543C86.4481 35.9646 87.9057 36.568 89.6317 36.568C91.3578 36.568 92.7898 35.9577 93.9769 34.7418C95.1606 33.5246 95.7541 32.0445 95.7541 30.2957V19.3098H92.6595V30.2991L92.6584 30.3003Z"
                fill="white"
              />
              <path
                d="M103.476 24.0542C101.764 24.0542 100.313 24.6587 99.1204 25.8667C97.9289 27.0747 97.332 28.5526 97.332 30.2991C97.332 32.0457 97.9244 33.5474 99.1082 34.7554C100.292 35.9634 101.747 36.568 103.474 36.568C105.095 36.568 106.492 35.9976 107.669 34.8567L105.79 32.3018C105.178 33.0362 104.406 33.4028 103.474 33.4028C102.802 33.4028 102.198 33.2036 101.664 32.8051C101.128 32.4066 100.762 31.8794 100.564 31.2225H109.526C109.571 30.9117 109.595 30.5997 109.595 30.2877C109.595 28.5435 109.002 27.0679 107.818 25.8611C106.634 24.6542 105.186 24.0508 103.474 24.0508L103.476 24.0542ZM100.794 28.8577C101.359 27.7647 102.253 27.2171 103.476 27.2171C104.698 27.2171 105.569 27.7636 106.135 28.8577H100.794Z"
                fill="white"
              />
              <path
                d="M117.344 24.0542C115.614 24.0542 114.16 24.6576 112.976 25.8576C111.793 27.0611 111.199 28.5458 111.199 30.3128V41.3112H114.294V30.3128C114.294 29.452 114.593 28.7211 115.187 28.1211C115.784 27.5176 116.501 27.2171 117.344 27.2171C118.187 27.2171 118.897 27.5176 119.487 28.1211C120.074 28.7211 120.368 29.452 120.368 30.3128C120.368 31.1735 120.074 31.9011 119.487 32.5011C118.897 33.1045 118.182 33.4051 117.344 33.4051C116.646 33.4051 116.033 33.2002 115.503 32.7823V36.289C116.087 36.4746 116.702 36.5691 117.344 36.5691C119.054 36.5691 120.502 35.9623 121.686 34.752C122.869 33.5417 123.463 32.0616 123.463 30.3128C123.463 28.564 122.869 27.0804 121.686 25.8702C120.502 24.6599 119.054 24.053 117.344 24.053V24.0542Z"
                fill="white"
              />
              <path
                d="M128.139 17.6794H125.044V29.9678C125.044 31.7155 125.64 33.1945 126.833 34.4036C128.024 35.6127 129.476 36.2173 131.188 36.2173V33.0533C130.347 33.0533 129.629 32.7527 129.033 32.1516C128.437 31.5504 128.139 30.8194 128.139 29.9598V26.7491H131.188V24.0542H128.139V17.6794Z"
                fill="white"
              />
              <path
                d="M143.244 25.8667C142.053 24.6587 140.601 24.0542 138.889 24.0542C137.804 24.0542 136.788 24.3206 135.84 24.8512V17.6794H132.746V36.2173H135.84V30.3037C135.84 29.4464 136.14 28.7177 136.738 28.1188C137.336 27.5199 138.057 27.2182 138.9 27.2182C139.743 27.2182 140.441 27.5222 141.039 28.1302C141.637 28.7382 141.937 29.4623 141.937 30.3037V36.2173H145.031V30.2991C145.031 28.5526 144.436 27.0747 143.243 25.8667H143.244Z"
                fill="white"
              />
              <path
                d="M84.8869 24.053H81.9515C80.24 24.053 78.789 24.6587 77.5975 25.8667C76.406 27.0747 75.8091 28.5526 75.8091 30.2991V36.2173H78.9037V30.2991C78.9037 29.4418 79.2021 28.7131 79.7979 28.112C80.3936 27.512 81.1119 27.2114 81.9515 27.2114V27.2171H82.4782C82.858 26.2846 83.4292 25.4398 84.153 24.7088C84.3858 24.4743 84.6319 24.2523 84.8869 24.053Z"
                fill="white"
              />
              <path
                d="M26.5373 31.5174C26.2756 31.5174 26.0629 31.7348 26.0629 32.0024C26.0629 32.27 26.2756 32.4874 26.5373 32.4874C26.799 32.4874 27.0117 32.27 27.0117 32.0024C27.0117 31.7348 26.799 31.5174 26.5373 31.5174Z"
                fill="white"
              />
            </svg>
          </span>
          <nav className="nav-links">
            <Link
              href="/"
              className={pathname === "/chart" ? "active" : ""}
            >
              Bitcoin chart
            </Link>
            <Link
              href="/chart"
              className={pathname === "/ethereum" ? "active" : ""}
            >
              Ethereum chart
            </Link>
            <Link
              href="/mylist"
              className={pathname === "/mylist" ? "active" : ""}
            >
              My list
            </Link>
            <Link
              href="/education"
              className={pathname === "/education" ? "active" : ""}
            >
              Education
            </Link>
            <Link
              href="/resources"
              className={pathname === "/resources" ? "active" : ""}
            >
              Resources
            </Link>
          </nav>
        </div>

        <div className="right-group">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search alts"
              className="search-input"
            />
            <svg
              className="search-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <svg
            className="bell-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405M18 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1"
            />
          </svg>

          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center text-white hover:text-[#2962ff] transition-colors focus:outline-none"
              >
                <span className="bg-[#2962ff] rounded-full w-9 h-9 flex items-center justify-center text-white font-medium mr-2">
                  {user?.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="mr-1">{user?.displayName}</span>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1c2030] border border-[#2a2e39] rounded-md shadow-lg z-10">
                  <div className="py-1">
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-sm text-[#afb5c4] hover:bg-[#262b3c] hover:text-white"
                      onClick={() => setShowUserMenu(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm text-[#afb5c4] hover:bg-[#262b3c] hover:text-white"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                className="btn-register"
                onClick={() => setIsAuthModalOpen(true)}
              >
                Register
              </button>
              <button
                className="btn-login"
                onClick={() => setIsAuthModalOpen(true)}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </header>
  );
};

export default Header;
