import subprocess
import shutil
import os
import platform

def compile_and_move_go_binary(plat):
    # 编译Go二进制文件
    if plat == "windows":
        go_build_command = ["go", "build","-x","-v", "-o", "main.exe"]
        subprocess.run(go_build_command, cwd="backend/main")
    else:
        os.system(".\\buildback.bat")
    if plat == "windows":
        shutil.move("backend/main/main.exe", "pack/main.exe")
    else:
        shutil.move("backend/main/main", "pack/main")

def build_and_move_frontend():
    # 在frontend目录下执行vite build
    vite_build_command = ["npm","run", "build"]
    os.chdir("frontend")
    os.system("npm run build")
    os.chdir("..")
    shutil.move("frontend/dist", "pack")
    os.rename("pack/dist", "pack/front")

def main():
    # 判断操作系统类型
    system_platform = platform.system().lower()
    # 删除pack目录中的文件，并重新创建
    if not os.path.exists("pack"):
        os.mkdir("pack")
    if os.path.exists("pack/main"):
        os.remove("pack/main")
    if os.path.exists("pack/main.exe"):
        os.remove("pack/main.exe")
    if os.path.exists("pack/front"):
        shutil.rmtree("pack/front")
    compile_and_move_go_binary("linux")
    build_and_move_frontend()

if __name__ == "__main__":
    main()
    input("打包完成，按回车键退出")
