import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/user/user';
import { Router, RouterModule } from '@angular/router';
import { Observable, catchError, of, map } from 'rxjs';
import { tap } from 'rxjs/operators';

import { Team as TeamModel } from '../../models/team/team';
import { Team as TeamService } from '../../services/team/team';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class ProfileComponent implements OnInit {
  public authService = inject(AuthService);
  private router = inject(Router);
  public isLoading = signal<boolean>(true);
  public userProfile$: Observable<User | null> = of(null);
  public currentUserBasic = this.authService.currentUser;
  private teamService = inject(TeamService);
  public teams: TeamModel[] = [];
  public isUpdatingProfileImage = signal<boolean>(false);
  public profileImageOptions = Array.from({ length: 20 }, (_, i) => i + 1);
  public showProfileImageSelector = signal<boolean>(false);

  ngOnInit(): void {
    this.userProfile$ = this.authService.getProfile().pipe(
      tap((profile) => {
        this.authService.currentUser.set(profile);
        if (profile?._id) {
          this.refreshTeams(profile._id);
        } else {
          this.teams = [];
        }
      }),
      catchError((error) => {
        console.error('Error al cargar el perfil. Token inválido o expirado.', error);
        if (error.status === 401) {
          this.authService.logout();
          this.router.navigate(['/login']);
        }
        return of(null);
      }),
      map((data) => {
        this.isLoading.set(false);
        return data;
      }),
    );
  }

  onSelectEquipo(teamId: string) {
    this.router.navigate(['/team-detail'], {
      queryParams: { teamId },
    });
  }

  onDeleteEquipo(equipo: TeamModel) {
    const teamId = equipo._id;
    if (confirm(`Are you sure you want to delete the team: "${equipo.name}"?`)) {
      this.teamService.delete(teamId!).subscribe({
        next: () => {
          const currentUser = this.authService.currentUser();
          if (currentUser?._id) this.refreshTeams(currentUser._id);
        },
      });
    }
  }

  private refreshTeams(userId: string) {
    this.teamService.getByUserId(userId).subscribe({
      next: (teams: any) => {
        this.teams = teams as TeamModel[];
      },
      error: (err) => {
        console.error('Error loading teams for user', err);
        this.teams = [];
      },
    });
  }

  toggleProfileImageSelector(): void {
    this.showProfileImageSelector.update(val => !val);
  }

  selectProfileImage(imageNumber: number): void {
    const currentUser = this.authService.currentUser();
    if (!currentUser?._id) {
      console.error('No current user');
      return;
    }

    console.log('Iniciando cambio de foto de perfil a:', imageNumber);
    console.log('User ID:', currentUser._id);
    console.log('API URL:', `users/${currentUser._id}/profile-image`);

    // Guardar estado anterior por si hay que revertir
    const previousUser = { ...currentUser };
    const updatedUser = { ...currentUser, profileImage: imageNumber };

    // Actualizar de forma optimista en el frontend
    this.authService.currentUser.set(updatedUser);
    this.isUpdatingProfileImage.set(true);

    // Actualizar en el backend
    this.authService.updateProfileImage(currentUser._id, imageNumber).subscribe({
      next: (response) => {
        console.log('Respuesta del servidor:', response);
        this.isUpdatingProfileImage.set(false);
        // Cerrar el selector solo si fue exitosa la actualización
        this.showProfileImageSelector.set(false);
      },
      error: (err) => {
        console.error('Error al actualizar la foto de perfil:', err);
        console.error('Status:', err.status);
        console.error('Error message:', err.error);
        this.isUpdatingProfileImage.set(false);
        // Revertir a la foto anterior si hay error
        this.authService.currentUser.set(previousUser);
      },
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
